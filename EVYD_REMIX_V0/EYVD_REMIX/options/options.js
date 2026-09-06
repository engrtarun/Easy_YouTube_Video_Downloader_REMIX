document.addEventListener('DOMContentLoaded', async () => {
    // 1. Tab Navigation Logic
    const navItems = document.querySelectorAll('.nav-item');
    const tabPanes = document.querySelectorAll('.tab-pane');

    navItems.forEach(item => {
        item.addEventListener('click', () => {
            // Remove active classes
            navItems.forEach(nav => nav.classList.remove('active'));
            tabPanes.forEach(tab => tab.classList.remove('active'));

            // Add active class to clicked
            item.classList.add('active');
            const targetId = item.getAttribute('data-tab');
            document.getElementById(targetId).classList.add('active');
        });
    });

    // 2. Settings Logic (Load & Save)
    const storage = (typeof browser !== 'undefined' && browser.storage) ? browser.storage.sync : chrome.storage.sync;
    
    // Polyfill for promise-based storage if needed
    const getStorage = (keys) => {
        return new Promise((resolve) => {
            storage.get(keys, (result) => {
                resolve(result || {});
            });
        });
    };

    const setStorage = (data) => {
        return new Promise((resolve) => {
            storage.set(data, () => {
                resolve();
            });
        });
    };

    const form = document.getElementById('optionsForm');
    const autoplay = document.getElementById('autoplay');
    const prokey = document.getElementById('prokey');
    const notification = document.getElementById('notification');
    const statusEl = document.getElementById('status');
    const emailError = document.getElementById('emailError');

    // Load existing settings
    try {
        const data = await getStorage({ autop: false, pKey: "", noNotify: false });
        if (autoplay) autoplay.checked = data.autop === true;
        if (prokey) prokey.value = data.pKey || "";
        if (notification) notification.checked = data.noNotify === true;
    } catch (e) {
        console.error("Error loading settings", e);
    }

    // Email validation logic
    const validateEmail = (email) => {
        if (email.trim() === '') return true; // Empty is allowed
        const re = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
        return re.test(String(email).toLowerCase());
    };

    if (prokey) {
        prokey.addEventListener('blur', (e) => {
            if (!validateEmail(e.target.value)) {
                prokey.style.borderColor = 'var(--danger)';
                emailError.style.display = 'block';
            } else {
                prokey.style.borderColor = '';
                emailError.style.display = 'none';
            }
        });
    }

    // Save settings
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        // Prevent save if validation fails on active tab
        if (prokey && !validateEmail(prokey.value)) {
            return;
        }

        const settingsToSave = {
            autop: autoplay.checked,
            pKey: prokey.value,
            noNotify: notification.checked
        };

        await setStorage(settingsToSave);
        
        statusEl.style.opacity = 1;
        setTimeout(() => {
            statusEl.style.opacity = 0;
        }, 2000);
    });

    // 3. Backup & Restore Logic
    const exportBtn = document.getElementById('exportBtn');
    const importBtn = document.getElementById('importBtn');
    const importFile = document.getElementById('importFile');
    const backupStatus = document.getElementById('backupStatus');

    const showBackupStatus = (msg, isError = false) => {
        backupStatus.textContent = msg;
        backupStatus.style.color = isError ? 'var(--danger)' : 'var(--success)';
        backupStatus.style.opacity = 1;
        setTimeout(() => {
            backupStatus.style.opacity = 0;
        }, 3000);
    };

    // Export to JSON
    exportBtn.addEventListener('click', async () => {
        try {
            const data = await getStorage(null); // get all storage
            const dataStr = JSON.stringify(data, null, 2);
            const blob = new Blob([dataStr], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            
            const a = document.createElement('a');
            a.href = url;
            a.download = `eyvd_remix_settings_${new Date().toISOString().slice(0,10)}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            showBackupStatus("Export successful!");
        } catch (e) {
            console.error("Export failed", e);
            showBackupStatus("Export failed!", true);
        }
    });

    // Import from JSON
    importBtn.addEventListener('click', () => {
        importFile.click();
    });

    importFile.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const importedData = JSON.parse(event.target.result);
                
                // Validate that it looks like our settings object
                if (typeof importedData === 'object' && importedData !== null) {
                    await setStorage(importedData);
                    
                    // Update UI
                    if (autoplay && importedData.autop !== undefined) autoplay.checked = importedData.autop;
                    if (prokey && importedData.pKey !== undefined) prokey.value = importedData.pKey;
                    if (notification && importedData.noNotify !== undefined) notification.checked = importedData.noNotify;
                    
                    showBackupStatus("Import successful! Settings applied.");
                } else {
                    throw new Error("Invalid JSON structure");
                }
            } catch (err) {
                console.error("Import failed", err);
                showBackupStatus("Import failed! Invalid file format.", true);
            }
            // Reset input
            importFile.value = '';
        };
        reader.readAsText(file);
    });
});