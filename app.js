// =========================================================================
// 1. SUPABASE SETUP & DOM-ELEMENTE
// =========================================================================
const SUPABASE_URL = "https://hhpalkdsynvyecjqklkb.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhocGFsa2RzeW52eWVjanFrbGtiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQxMzI2MzcsImV4cCI6MjA5OTcwODYzN30.mLZxm4jQntv6VatcyHc4NQptWPnyZoq8NrhRFEPeDKU";

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const appContainer = document.getElementById('app-container');
const authContainer = document.getElementById("auth-container");
const authWrapper = document.querySelector('.auth-wrapper');
const registerTabBtn = document.getElementById('tab-register');

const logoutBtn = document.querySelector('.logout-btn[onclick="handleLogout()"]');
const emailDisplay = document.getElementById('user-email-display');

const transferModal = document.getElementById('transfer-data-modal');
const btnKeepData = document.getElementById('btn-keep-data');
const btnDiscardData = document.getElementById('btn-discard-data');
const guestRegisterBtn = document.getElementById('guest-register-btn'); // Dein Button im Header

// =========================================================================
// 2. STATE (ZUSTAND DER APP)
// =========================================================================
let currentAuthMode = 'login';
let isGuestMode = false;
let keepGuestData = false;

// =========================================================================
// 3. AUTH-LOGIK & SESSIONS
// =========================================================================

// Zentrale Funktion für den UI-Wechsel
window.navigiereZuAuth = function (mode = 'register') {
    // 1. App-Container ausblenden
    if (appContainer) {
        appContainer.style.display = 'none';
    }
    // 2. Auth-Container einblenden
    if (authContainer) {
        authContainer.style.display = 'flex';
    }
    // 3. Korrekten Tab setzen
    switchAuthTab(mode);
};

window.navigiereZuApp = function () {
    if (authContainer) authContainer.style.display = 'none';
    if (appContainer) appContainer.style.display = 'block';

    // Sicherheit: Wenn wir keine Daten haben, lade sie zumindest als leere Struktur
    if (Object.keys(savedData).length === 0) {
        subjectsConfig.forEach(sub => {
            savedData[sub.id] = { kleine: [], arbeiten: [] };
        });
    }

    renderTable();
    berechneGesamtSchnitt();
};


function updateAppUI(isLoggedIn, isGuest, email = "") {
    if (isLoggedIn) {
        if (appContainer) appContainer.style.display = "block";
        if (authContainer) authContainer.style.display = "none";
        if (emailDisplay) emailDisplay.innerText = email;
    } else if (isGuest) {
        if (appContainer) appContainer.style.display = "block";
        if (authContainer) authContainer.style.display = "none";
        if (emailDisplay) emailDisplay.innerText = "Gast-Modus (keine Speicherung)";
    } else {
        if (appContainer) appContainer.style.display = "none";
        if (authContainer) authContainer.style.display = "flex";
        if (emailDisplay) emailDisplay.innerText = "";
    }
}

supabaseClient.auth.onAuthStateChange((event, session) => {
    if (session) {
        isGuestMode = false;
        updateAppUI(true, false, session.user.email);
        updateHeaderMode(false, session.user.email); // Header auf Nutzer-Modus stellen
        loadDataFromCloud(session.user.id);
    } else if (!isGuestMode) {
        updateAppUI(false, false);
        updateHeaderMode(false); // Zurücksetzen
    }
});

window.switchAuthTab = function (mode) {
    currentAuthMode = mode;
    const tabLogin = document.getElementById("tab-login");
    const tabRegister = document.getElementById("tab-register");
    const submitBtn = document.getElementById("auth-submit-btn");
    const title = document.getElementById("auth-card-title");
    const usernameInput = document.getElementById("auth-username");
    if (usernameInput) {
        usernameInput.placeholder = "beispiel@email.com";
    }

    if (mode === 'login') {
        if (tabLogin) tabLogin.classList.add("active");
        if (tabRegister) tabRegister.classList.remove("active");
        if (submitBtn) submitBtn.innerText = "Anmelden";
        if (title) title.innerText = "Anmelden";
    } else if (mode === 'register') {
        if (tabRegister) tabRegister.classList.add("active");
        if (tabLogin) tabLogin.classList.remove("active");
        if (submitBtn) submitBtn.innerText = "Registrieren";
        if (title) title.innerText = "Konto erstellen";
    }
};

window.handleAuthSubmit = async function () {
    const emailInput = document.getElementById("auth-username").value.trim();
    const passwordInput = document.getElementById("auth-password").value.trim();

    if (!emailInput || !passwordInput) {
        alert("Bitte fülle alle Felder aus.");
        return;
    }

    if (!emailInput.includes("@")) {
        alert("Bitte gib eine gültige E-Mail-Adresse ein.");
        return;
    }

    try {
        if (currentAuthMode === 'login') {
            const { data, error } = await supabaseClient.auth.signInWithPassword({
                email: emailInput,
                password: passwordInput,
            });

            if (error) {
                alert("Login fehlgeschlagen: " + error.message);
                return;
            }

            // Transfer-Logik für Login:
            // Falls beim Login ein Transfer aus dem Gast-Modus ansteht:
            const shouldTransfer = localStorage.getItem('pendingTransfer') === 'true';
            if (shouldTransfer) {
                await saveToCloud(); // Speichert die aktuellen lokalen Daten in den Cloud-Account
                localStorage.removeItem('pendingTransfer');
            }

            console.log("Erfolgreich eingeloggt:", data);
            navigiereZuApp(); // Wechselt zur App und rendert die Tabelle

        } else {
            // Registrierung
            const { data, error } = await supabaseClient.auth.signUp({
                email: emailInput,
                password: passwordInput,
            });

            if (error) {
                alert("Registrierung fehlgeschlagen: " + error.message);
                return;
            }

            await new Promise(resolve => setTimeout(resolve, 500));

            // Nach Registrierung prüfen, ob Gast-Daten mitgenommen werden sollen
            const shouldTransfer = localStorage.getItem('pendingTransfer') === 'true';
            if (shouldTransfer) {
                // Wir speichern die Daten direkt in den neuen Account
                await saveToCloud();
                localStorage.removeItem('pendingTransfer');
            }

            alert("Registrierung erfolgreich! Du wirst eingeloggt.");

            // Da Supabase bei .signUp oft automatisch einloggt, 
            // leiten wir hier direkt zur App weiter
            navigiereZuApp();
        }

        document.getElementById("auth-username").value = "";
        document.getElementById("auth-password").value = "";

    } catch (err) {
        console.error("Unerwarteter Auth-Fehler:", err);
        alert("Es gab einen internen Fehler bei der Verbindung: " + err.message);
    }
};


// =========================================================================
// 4. GAST- & LOGOUT-FUNKTIONEN
// =========================================================================
window.startAsGuest = function () {
    isGuestMode = true;

    // 1. Config auf Default zurücksetzen
    subjectsConfig = JSON.parse(JSON.stringify(defaultSubjectsConfig));

    // 2. savedData komplett neu aufbauen, basierend auf der Config
    savedData = {};
    subjectsConfig.forEach(sub => {
        savedData[sub.id] = { kleine: [], arbeiten: [] };
    });

    // 3. UI-Wechsel (zuerst Container, dann Tabelle)
    if (authContainer) authContainer.style.display = "none";
    if (appContainer) appContainer.style.display = "block";

    updateHeaderMode(isGuestMode);
    // 4. Erzwinge das Rendern
    renderTable();
};

async function handleLogout() {
    await supabaseClient.auth.signOut();
    isGuestMode = false;
    updateAppUI(false, false);
    switchAuthTab('login');
}

function updateHeaderMode(isGuest, userEmail = "") {
    if (isGuest) {
        if (guestRegisterBtn) guestRegisterBtn.style.display = 'inline-block'; // Zeigen
        if (logoutBtn) logoutBtn.style.display = 'none'; // Ausblenden
        if (emailDisplay) {
            emailDisplay.style.display = 'inline'; // ANZEIGEN statt none!
            emailDisplay.textContent = "Gast-Modus (keine Speicherung)"; // Dein gewünschter Text
            emailDisplay.style.color = "#f59e0b"; // Optional: Farbe für Gast-Status
        }
    } else {
        if (guestRegisterBtn) guestRegisterBtn.style.display = 'none'; // Ausblenden
        if (logoutBtn) logoutBtn.style.display = 'inline-block'; // Zeigen
        if (emailDisplay) {
            emailDisplay.style.display = 'inline';
            emailDisplay.textContent = userEmail;
            emailDisplay.style.color = ""; // Standardfarbe
        }
    }
}

window.hatGastEintraege = function () {
    // 1. Prüfen, ob Noten eingetragen wurden
    const hatNoten = Object.values(savedData).some(fach =>
        (fach.kleine && fach.kleine.length > 0) ||
        (fach.arbeiten && fach.arbeiten.length > 0)
    );

    // 2. Prüfen, ob die Fächer-Konfiguration von der Standard-Konfiguration abweicht
    const istConfigVerändert = JSON.stringify(subjectsConfig) !== JSON.stringify(defaultSubjectsConfig);

    // Beides zusammen ergibt die Entscheidungsgrundlage
    return hatNoten || istConfigVerändert;
};

// =========================================================================
// 5. NOTEN-LOGIK, CONFIGS & BERECHNUNGEN
// =========================================================================
const gradeScale = {
    "1": 1.0, "1-": 1.25, "2+": 1.75, "2": 2.0, "2-": 2.25,
    "3+": 2.75, "3": 3.0, "3-": 3.25, "4+": 3.75, "4": 4.0,
    "4-": 4.25, "5+": 4.75, "5": 5.0, "5-": 5.25, "6": 6.0
};
const gradeOrder = ["1", "1-", "2+", "2", "2-", "3+", "3", "3-", "4+", "4", "4-", "5+", "5", "5-", "6"];

const defaultSubjectsConfig = [
    { id: "mathe", name: "Mathe", color: "#0848d2", weightKL: 0.5, weightArb: 0.5 },
    { id: "englisch", name: "Englisch", color: "#0d6f31", weightKL: 0.5, weightArb: 0.5 },
    { id: "deutsch", name: "Deutsch", color: "#f01616", weightKL: 0.5, weightArb: 0.5 },
    { id: "spafra", name: "Fremdsprache (Spa/Fra)", color: "#ea580c", weightKL: 0.6, weightArb: 0.4 },
    { id: "biologie", name: "Biologie", color: "#91ff66", weightKL: 0.6, weightArb: 0.4 },
    { id: "chemie", name: "Chemie", color: "#008c80", weightKL: 0.6, weightArb: 0.4 },
    { id: "physik", name: "Physik", color: "#665ff1", weightKL: 0.6, weightArb: 0.4 },
    { id: "geschichte", name: "Geschichte", color: "#ca8a04", weightKL: 0.6, weightArb: 0.4 },
    { id: "pgw", name: "PGW", color: "#475569", weightKL: 0.6, weightArb: 0.4 },
    { id: "geografie", name: "Geografie", color: "#c3c3c3", weightKL: 0.6, weightArb: 0.4 },
    { id: "philosophie", name: "Philosophie", color: "#ff27d7", weightKL: 0.6, weightArb: 0.4 },
    { id: "informatik", name: "Informatik", color: "#562f9b", weightKL: 0.6, weightArb: 0.4 },
    { id: "theater", name: "Theater", color: "#db2777", weightKL: 0.6, weightArb: 0.4 },
    { id: "sport", name: "Sport", color: "#0284c7", weightKL: 0.6, weightArb: 0.4 }
];

let subjectsConfig = defaultSubjectsConfig;
let savedData = {};
let tempConfig = [];

async function saveToCloud() {
    try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (session && session.user) {
            const { data: existingData } = await supabaseClient
                .from('user_data')
                .select('id')
                .eq('user_id', session.user.id);

            const payload = {
                user_id: session.user.id,
                subjects_config: subjectsConfig,
                grades_data: savedData
            };

            const { error } = (existingData && existingData.length > 0)
                ? await supabaseClient.from('user_data').update(payload).eq('id', existingData[0].id)
                : await supabaseClient.from('user_data').insert(payload);

            if (error) {
                console.error("Fehler beim Speichern:", error.message);
            } else {
                console.log("Erfolgreich in der Cloud gespeichert!");
            }
        }
    } catch (err) {
        console.error("Unerwarteter Fehler:", err);
    }
}

function saveData() {
    berechneGesamtSchnitt();
    if (isGuestMode) {
        return;
    }
    saveToCloud();
}

function saveConfig() {
    if (isGuestMode) {
        return;
    }
    saveToCloud();
}

function getContrastColor(hex) {
    if (!hex) return "#ffffff";
    hex = hex.replace('#', '');
    if (hex.length === 3) {
        hex = hex.split('').map(c => c + c).join('');
    }
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
    return (yiq >= 128) ? '#000000' : '#ffffff';
}

function berechneKategorieSchnitt(notenArray) {
    if (!notenArray || notenArray.length === 0) return null;

    let summeNotenMalGewicht = 0;
    let summeGewichte = 0;

    notenArray.forEach(item => {
        let noteWert = 0;
        let gewicht = item.gewicht || 1;

        if (item.istPaket) {
            const paketNotenWerte = item.noten.map(n => gradeScale[n]);
            const summePaket = paketNotenWerte.reduce((a, b) => a + b, 0);
            noteWert = summePaket / item.noten.length;
        } else {
            noteWert = gradeScale[item.note];
        }

        summeNotenMalGewicht += (noteWert * gewicht);
        summeGewichte += gewicht;
    });

    return summeNotenMalGewicht / summeGewichte;
}

function berechneFachNoten(subId) {
    const data = savedData[subId] || { kleine: [], arbeiten: [] };
    const config = subjectsConfig.find(s => s.id === subId);

    if (!config) {
        return { kl: "-", arb: "-", komma: "-", echt: "-" };
    }

    const schnittKL = berechneKategorieSchnitt(data.kleine);
    const schnittArb = berechneKategorieSchnitt(data.arbeiten);

    let kommaNote = null;
    let echteNote = "-";

    if (schnittKL !== null && schnittArb !== null) {
        kommaNote = (schnittKL * config.weightKL) + (schnittArb * config.weightArb);
    } else if (schnittKL !== null) {
        kommaNote = schnittKL;
    } else if (schnittArb !== null) {
        kommaNote = schnittArb;
    }

    if (kommaNote !== null) {
        echteNote = Math.round(kommaNote);
    }

    return {
        kl: schnittKL !== null ? schnittKL.toFixed(2) : "-",
        arb: schnittArb !== null ? schnittArb.toFixed(2) : "-",
        komma: kommaNote !== null ? kommaNote.toFixed(2) : "-",
        echt: echteNote
    };
}

function berechneGesamtSchnitt() {
    let summeKomma = 0;
    let anzahlFaecherKomma = 0;
    let summeEcht = 0;
    let anzahlFaecherEcht = 0;

    subjectsConfig.forEach(sub => {
        const noten = berechneFachNoten(sub.id);
        if (noten.komma !== "-") {
            summeKomma += parseFloat(noten.komma);
            anzahlFaecherKomma++;
        }
        if (noten.echt !== "-") {
            summeEcht += parseFloat(noten.echt);
            anzahlFaecherEcht++;
        }
    });

    const kommaSchnittVal = anzahlFaecherKomma > 0 ? (summeKomma / anzahlFaecherKomma).toFixed(2) : "-";
    const echtSchnittVal = anzahlFaecherEcht > 0 ? (summeEcht / anzahlFaecherEcht).toFixed(2) : "-";

    const kSchnittEl = document.getElementById("zeugnisdurchschnittkomma");
    const eSchnittEl = document.getElementById("zeugnisdurchschnittecht");
    if (kSchnittEl) kSchnittEl.innerText = kommaformat(kommaSchnittVal);
    if (eSchnittEl) eSchnittEl.innerText = kommaformat(echtSchnittVal);
}

function kommaformat(zahl) {
    if (zahl === "-" || zahl === null || zahl === undefined) return "-";
    return zahl.toString().replace('.', ',');
}

window.updateInlineWeight = function (subId, type, value) {
    const config = subjectsConfig.find(s => s.id === subId);
    if (!config) return;

    let numValue = parseInt(value) || 0;
    if (numValue < 0) numValue = 0;
    if (numValue > 100) numValue = 100;

    if (type === 'KL') {
        config.weightKL = numValue / 100;
        config.weightArb = (100 - numValue) / 100;
    } else {
        config.weightArb = numValue / 100;
        config.weightKL = (100 - numValue) / 100;
    }

    saveConfig();

    const klInput = document.getElementById(`weight-kl-input-${subId}`);
    const arbInput = document.getElementById(`weight-arb-input-${subId}`);
    if (klInput) klInput.value = Math.round(config.weightKL * 100);
    if (arbInput) arbInput.value = Math.round(config.weightArb * 100);

    updateUIRow(subId);
};

window.balanceNewSubjectWeights = function (changedType) {
    const klInput = document.getElementById("new-sub-w-kl");
    const arbInput = document.getElementById("new-sub-w-arb");

    let klVal = parseInt(klInput.value) || 0;
    let arbVal = parseInt(arbInput.value) || 0;

    if (changedType === 'KL') {
        if (klVal > 100) klVal = 100;
        if (klVal < 0) klVal = 0;
        klInput.value = klVal;
        arbInput.value = 100 - klVal;
    } else {
        if (arbVal > 100) arbVal = 100;
        if (arbVal < 0) arbVal = 0;
        arbInput.value = arbVal;
        klInput.value = 100 - arbVal;
    }
};

window.togglePaketInput = function (subId) {
    const form = document.getElementById(`paket-form-${subId}`);
    if (form) {
        const isHidden = form.style.display === "none";
        form.style.display = isHidden ? "inline-flex" : "none";
    }
};

async function loadDataFromCloud(userId) {
    try {
        const { data, error } = await supabaseClient
            .from('user_data')
            .select('subjects_config, grades_data')
            .eq('user_id', userId)
            .single();

        if (data) {
            subjectsConfig = data.subjects_config || defaultSubjectsConfig;
            savedData = data.grades_data || {};
        } else {
            subjectsConfig = defaultSubjectsConfig;
            savedData = {};
        }
        renderTable();
    } catch (err) {
        console.error("Fehler beim Laden:", err);
    }
}

// =========================================================================
// 6. UI RENDERING
// =========================================================================

window.renderTable = function () {

    // DEBUG: Erzwinge Sichtbarkeit
    const appContainer = document.getElementById('app-container');
    if (appContainer) {
        appContainer.style.display = "block";
        appContainer.style.visibility = "visible";
    }

    const tbody = document.getElementById("table-body");
    if (!tbody) {
        console.error("Fehler: tbody Element nicht gefunden!");
        return;
    }
    tbody.innerHTML = "";

    subjectsConfig.forEach(sub => {
        if (!savedData[sub.id]) {
            savedData[sub.id] = { kleine: [], arbeiten: [] };
        }

        const noten = berechneFachNoten(sub.id);
        const contrastColor = getContrastColor(sub.color);

        const klPercent = Math.round(sub.weightKL * 100);
        const arbPercent = Math.round(sub.weightArb * 100);

        const mainTr = document.createElement("tr");
        mainTr.className = "excel-tr";
        mainTr.onclick = () => toggleDetails(sub.id);
        mainTr.innerHTML = `
            <td class="excel-td">
                <div class="weight-pill-box" onclick="event.stopPropagation();">
                    <input type="text" id="weight-kl-input-${sub.id}" value="${klPercent}" class="weight-inline-input kl-val" onchange="updateInlineWeight('${sub.id}', 'KL', this.value)" title="Mündlich %">
                    <span class="weight-separator">/</span>
                    <input type="text" id="weight-arb-input-${sub.id}" value="${arbPercent}" class="weight-inline-input arb-val" onchange="updateInlineWeight('${sub.id}', 'Arb', this.value)" title="Schriftlich %">
                </div>  
            </td>
            <td class="excel-td">
                <span class="subject-badge" style="background-color: ${sub.color}; color: ${contrastColor};">
                    ${sub.name}
                </span>
            </td>
            <td class="excel-td" id="echt-cell-${sub.id}" style="color: #10b981; font-weight: bold; font-size: 15px;">${noten.echt === "-" ? "-" : noten.echt}</td>
            <td class="excel-td" id="komma-cell-${sub.id}" style="color: #3b82f6; font-weight: bold;">${kommaformat(noten.komma)}</td>
            <td class="excel-td" id="kl-cell-${sub.id}" style="font-weight: bold; color: var(--text-color);">${kommaformat(noten.kl)}</td>
            <td class="excel-td" id="arb-cell-${sub.id}" style="font-weight: bold; color: var(--text-color);">${kommaformat(noten.arb)}</td>
        `;
        tbody.appendChild(mainTr);

        const detailTr = document.createElement("tr");
        detailTr.id = `details-${sub.id}`;
        detailTr.className = "detail-row";

        let gradeOptions = gradeOrder.map(g => `<option value="${g}">${g}</option>`).join("");

        detailTr.innerHTML = `
            <td colspan="6" style="padding: 0;">
                <div class="compact-detail-row">
                    <span class="detail-lbl-inline">Mündlich</span>
                    <div class="inline-tags-and-form">
                        <div class="tags-container" id="tags-kl-${sub.id}"></div>
                        
                        <div class="inline-add-form" onclick="event.stopPropagation();">
                            <select id="note-val-kl-${sub.id}">${gradeOptions}</select>
                            <select id="note-weight-kl-${sub.id}">
                                <option value="1">1x</option>
                                <option value="2">2x</option>
                                <option value="0.5">0.5x</option>
                            </select>
                            <input type="text" id="note-notiz-kl-${sub.id}" placeholder="Notiz..." style="width: 75px;">
                            <button onclick="addSingleGrade('${sub.id}', 'kleine')">+</button>
                        </div>

                        <button class="mini-packet-toggle" onclick="event.stopPropagation(); togglePaketInput('${sub.id}')">
                            <span>📦 Paket</span>
                        </button>

                        <div id="paket-form-${sub.id}" class="inline-add-form" style="display: none; border-color: var(--accent-blue);" onclick="event.stopPropagation();">
                            <input type="text" id="paket-name-${sub.id}" placeholder="z.B. Quiz" style="width: 70px;">
                            <input type="text" id="paket-grades-${sub.id}" placeholder="2+, 1-, 3" style="width: 100px;">
                            <button onclick="addPaketGrade('${sub.id}')">+</button>
                        </div>
                    </div>
                </div>

                <div class="compact-detail-row">
                    <span class="detail-lbl-inline">Schriftlich</span>
                    <div class="inline-tags-and-form">
                        <div class="tags-container" id="tags-arb-${sub.id}"></div>
                        
                        <div class="inline-add-form" onclick="event.stopPropagation();">
                            <select id="note-val-arb-${sub.id}">${gradeOptions}</select>
                            <input type="text" id="note-notiz-arb-${sub.id}" placeholder="Notiz..." style="width: 120px;">
                            <button onclick="addSingleGrade('${sub.id}', 'arbeiten')">+</button>
                        </div>
                    </div>
                </div>
            </td>
        `;
        tbody.appendChild(detailTr);
        renderSubjectTags(sub.id);
    });

    berechneGesamtSchnitt();
};

window.toggleDetails = function (subId) {
    const detailRow = document.getElementById(`details-${subId}`);
    if (!detailRow) return;
    const isVisible = detailRow.style.display === "table-row";

    document.querySelectorAll(".detail-row").forEach(row => row.style.display = "none");

    if (!isVisible) {
        detailRow.style.display = "table-row";
    }
};

window.renderSubjectTags = function (subId) {
    const data = savedData[subId];
    if (!data) return;

    const containerKL = document.getElementById(`tags-kl-${subId}`);
    if (containerKL) {
        containerKL.innerHTML = "";
        data.kleine.forEach((item, idx) => {
            const tag = document.createElement("span");
            tag.className = "note-tag";
            if (item.istPaket) {
                tag.innerHTML = `📦 ${item.name} (${item.noten.join(", ")}) <span class="remove-btn" onclick="event.stopPropagation(); removeGrade('${subId}', 'kleine', ${idx})">&times;</span>`;
            } else {
                let weightText = item.gewicht == 2 ? "2x" : item.gewicht == 0.5 ? "0.5x" : "";
                let notizText = item.notiz ? `<span class="notiz-text">${item.notiz}</span>` : "";
                tag.innerHTML = `
                    ${item.note} 
                    ${weightText ? `<span class="sub-info">${weightText}</span>` : ""} 
                    ${notizText}
                    <span class="remove-btn" onclick="event.stopPropagation(); removeGrade('${subId}', 'kleine', ${idx})">&times;</span>
                `;
            }
            containerKL.appendChild(tag);
        });
    }

    const containerArb = document.getElementById(`tags-arb-${subId}`);
    if (containerArb) {
        containerArb.innerHTML = "";
        data.arbeiten.forEach((item, idx) => {
            const tag = document.createElement("span");
            tag.className = "note-tag";
            let notizText = item.notiz ? `<span class="notiz-text">${item.notiz}</span>` : "";
            tag.innerHTML = `
                ${item.note} 
                ${notizText}
                <span class="remove-btn" onclick="event.stopPropagation(); removeGrade('${subId}', 'arbeiten', ${idx})">&times;</span>
            `;
            containerArb.appendChild(tag);
        });
    }
};

window.updateUIRow = function (subId) {
    const config = subjectsConfig.find(s => s.id === subId);
    if (!config) return;

    const noten = berechneFachNoten(subId);

    const echtCell = document.getElementById(`echt-cell-${subId}`);
    const kommaCell = document.getElementById(`komma-cell-${subId}`);
    const klCell = document.getElementById(`kl-cell-${subId}`);
    const arbCell = document.getElementById(`arb-cell-${subId}`);

    if (echtCell) echtCell.innerText = noten.echt;
    if (kommaCell) kommaCell.innerText = noten.komma;
    if (klCell) klCell.innerText = noten.kl;
    if (arbCell) arbCell.innerText = noten.arb;

    renderSubjectTags(subId);
    berechneGesamtSchnitt();
};

window.addSingleGrade = function (subId, category) {
    const selectId = category === "kleine" ? `note-val-kl-${subId}` : `note-val-arb-${subId}`;
    const notizId = category === "kleine" ? `note-notiz-kl-${subId}` : `note-notiz-arb-${subId}`;

    const note = document.getElementById(selectId).value;
    const notiz = document.getElementById(notizId).value.trim();

    let gewicht = 1;
    if (category === "kleine") {
        const weightId = `note-weight-kl-${subId}`;
        gewicht = parseFloat(document.getElementById(weightId).value);
    }

    savedData[subId][category].push({
        istPaket: false,
        note: note,
        gewicht: gewicht,
        notiz: notiz
    });

    document.getElementById(notizId).value = "";

    saveData();
    updateUIRow(subId);
};

window.addPaketGrade = function (subId) {
    const nameInput = document.getElementById(`paket-name-${subId}`);
    const gradesInput = document.getElementById(`paket-grades-${subId}`);

    const name = nameInput.value.trim() || "Noten-Paket";
    const gradesText = gradesInput.value.trim();

    if (!gradesText) return;

    const grades = gradesText.split(",")
        .map(g => g.trim())
        .filter(g => gradeScale[g] !== undefined);

    if (grades.length === 0) {
        alert("Keine gültigen Noten eingegeben (z.B. 2+, 1-, 3)");
        return;
    }

    savedData[subId].kleine.push({
        istPaket: true,
        name: name,
        noten: grades,
        gewicht: 1
    });

    nameInput.value = "";
    gradesInput.value = "";

    togglePaketInput(subId);

    saveData();
    updateUIRow(subId);
};

window.removeGrade = function (subId, category, index) {
    if (savedData[subId] && savedData[subId][category]) {
        savedData[subId][category].splice(index, 1);
        saveData();
        updateUIRow(subId);
    }
};

// =========================================================================
// 7. SETTINGS / MODAL-LOGIK
// =========================================================================
window.openModal = function () {
    document.body.classList.add("no-scroll");
    tempConfig = JSON.parse(JSON.stringify(subjectsConfig));
    renderModalSubjectList();
    const modal = document.getElementById("settings-modal");
    if (modal) modal.style.display = "flex";
};

window.closeModal = function () {
    document.body.classList.remove("no-scroll");
    const modal = document.getElementById("settings-modal");
    if (modal) modal.style.display = "none";
};

window.renderModalSubjectList = function () {
    const listContainer = document.getElementById("modal-subject-list");
    if (!listContainer) return;
    listContainer.innerHTML = "";

    tempConfig.forEach((sub, idx) => {
        const row = document.createElement("div");
        row.className = "edit-subject-row";
        row.innerHTML = `
            <div>
                <input type="text" value="${sub.name}" onchange="updateTempSub(${idx}, 'name', this.value)" style="width: 100%; padding: 8px; border-radius: 6px; background: var(--card-bg); color: white; border: 1px solid var(--border-color);">
            </div>
            <div style="font-size: 12px; color: #64748b; font-weight: bold;">
                ${Math.round(sub.weightKL * 100)}% / ${Math.round(sub.weightArb * 100)}%
            </div>
            <div class="color-input-wrapper">
                <input type="color" value="${sub.color}" onchange="updateTempSub(${idx}, 'color', this.value)" style="width: 30px; height: 30px; border: none; background: transparent; cursor: pointer;">
                <button class="reset-color-btn" onclick="resetSubjectColor(${idx})" title="Zurücksetzen">↺</button>
            </div>
            <div>
                <button class="delete-sub-btn" onclick="deleteTempSub(${idx})">Löschen</button>
            </div>
        `;
        listContainer.appendChild(row);
    });
};

window.updateTempSub = function (idx, field, value) {
    tempConfig[idx][field] = value;
};

window.deleteTempSub = function (idx) {
    tempConfig.splice(idx, 1);
    renderModalSubjectList();
};

window.addSubjectToModalList = function () {
    const nameInput = document.getElementById("new-sub-name");
    const klInput = document.getElementById("new-sub-w-kl");
    const arbInput = document.getElementById("new-sub-w-arb");
    const colorInput = document.getElementById("new-sub-color");

    const name = nameInput.value.trim();
    if (!name) return;

    const id = name.toLowerCase().replace(/[^a-z0-9]/g, "");
    const weightKL = parseFloat(klInput.value) / 100;
    const weightArb = parseFloat(arbInput.value) / 100;
    const color = colorInput.value;

    tempConfig.push({
        id: id,
        name: name,
        color: color,
        weightKL: weightKL,
        weightArb: weightArb
    });

    nameInput.value = "";
    klInput.value = "60";
    arbInput.value = "40";
    colorInput.value = "#3b82f6";

    renderModalSubjectList();
};

window.saveModalChanges = function () {
    subjectsConfig = JSON.parse(JSON.stringify(tempConfig));
    saveConfig();
    renderTable();
    closeModal();
};

window.resetSubjectColor = function (idx) {
    const originalSub = defaultSubjectsConfig.find(s => s.id === tempConfig[idx].id);
    if (originalSub) {
        tempConfig[idx].color = originalSub.color;
        renderModalSubjectList();
    }
};

// =========================================================================
// 8. INITIALISIERUNG & EVENT LISTENERS
// =========================================================================
document.addEventListener('DOMContentLoaded', async () => {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session) {
        isGuestMode = false;
    } else {
        updateAppUI(false, false);
    }
});


if (guestRegisterBtn) {
    guestRegisterBtn.addEventListener('click', () => {


        if (hatGastEintraege()) {
            if (transferModal) {
                transferModal.style.display = 'flex';
            } else {
                console.error("transferModal Element nicht gefunden!");
            }
        } else {
            /*
            // 1. App ausblenden
            if (appContainer) {
                appContainer.style.display = 'none';
                appContainer.style.visibility = 'hidden'; // Zur Sicherheit
            }

            // 2. Auth-Screen einblenden
            if (authContainer) {
                authContainer.style.display = 'flex';
                authContainer.style.visibility = 'visible';
            }

            switchAuthTab('register');*/
            navigiereZuAuth('register');
        }
    });
} else {
    console.error("guest-register-btn wurde im HTML nicht gefunden!");
}

// Gast -> Registrieren (Button im Header)
if (guestRegisterBtn) {
    guestRegisterBtn.addEventListener('click', () => {
        if (hatGastEintraege()) {
            transferModal.style.display = 'flex';
        } else {
            navigiereZuAuth('register');
        }
    });
}

// Modal-Buttons
btnKeepData.addEventListener('click', () => {
    localStorage.setItem('pendingTransfer', 'true');
    transferModal.style.display = 'none';
    navigiereZuAuth('register');
});

btnDiscardData.addEventListener('click', () => {
    localStorage.setItem('pendingTransfer', 'false');
    transferModal.style.display = 'none';
    navigiereZuAuth('register');
});