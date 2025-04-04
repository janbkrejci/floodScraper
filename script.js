// updated
async function fetchData() {
    try {
        // Použijeme CORS proxy, protože ČHMÚ pravděpodobně nepovoluje cross-origin požadavky
        const proxyUrl = 'https://corsproxy.io/?';
        const targetUrl = 'https://hydro.chmi.cz/hppsoldv/hpps_prfdata.php?seq=307024';
        const response = await fetch(proxyUrl + encodeURIComponent(targetUrl));
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const text = await response.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(text, 'text/html');
        
        // Loguji strukturu pro debugging
        console.log("Dokument načten, hledám tabulku s daty...");
        
        let dataTable = null;
        
        // Nejdříve zkusíme najít tabulku podle charakteristických hlaviček
        const tables = Array.from(doc.querySelectorAll('table'));
        for (const table of tables) {
            const headers = table.querySelectorAll('th');
            let hasDateColumn = false;
            let hasWaterLevelColumn = false;
            
            for (const header of headers) {
                const headerText = header.textContent.toLowerCase();
                if (headerText.includes('datum') || headerText.includes('čas')) {
                    hasDateColumn = true;
                }
                if (headerText.includes('stav')) {
                    hasWaterLevelColumn = true;
                }
            }
            
            // Musí mít obě požadované sloupce a alespoň 5 řádků dat (aby se vyloučily malé tabulky)
            if (hasDateColumn && hasWaterLevelColumn && table.querySelectorAll('tr').length > 5) {
                dataTable = table;
                break;
            }
        }

        // Alternativní způsob - hledáme tabulku se specifickým formátem dat
        if (!dataTable) {
            for (const table of tables) {
                const rows = table.querySelectorAll('tr');
                if (rows.length < 5) continue; // Přeskočit malé tabulky
                
                // Kontrola, zda první buňka druhého řádku obsahuje datum ve správném formátu
                if (rows.length > 1) {
                    const cells = rows[1].querySelectorAll('td');
                    if (cells.length >= 2) {
                        const dateText = cells[0].innerText.trim();
                        // Kontrola formátu data (DD.MM.YYYY)
                        if (/\d{2}\.\d{2}\.\d{4}/.test(dateText)) {
                            dataTable = table;
                            break;
                        }
                    }
                }
            }
        }

        if (!dataTable) {
            console.error("Tabulka s daty nebyla nalezena");
            return [];
        }
        
        console.log("Tabulka nalezena:", dataTable);
        
        // Zpracování řádků tabulky
        const rows = dataTable.querySelectorAll('tr');
        const result = [];

        // První řádek je pravděpodobně záhlaví, zkontrolujme to
        let startIndex = 0;
        const firstRowCells = rows[0].querySelectorAll('th');
        if (firstRowCells.length > 0) {
            // První řádek obsahuje záhlaví (th elementy), začneme od druhého řádku
            startIndex = 1;
        }

        for (let i = startIndex; i < rows.length; i++) {
            const cells = rows[i].querySelectorAll('td');
            if (cells.length >= 3) { // Očekáváme minimálně datum, stav a průtok
                const dateText = cells[0].innerText.trim();
                const waterHeightText = cells[1].innerText.trim();
                
                // Přeskočit řádky, které neobsahují validní datum (např. řádky s informacemi o stupních povodňové aktivity)
                if (!dateText.match(/\d{2}\.\d{2}\.\d{4}/) && !dateText.match(/\d{1,2}\.\d{1,2}\.\d{4}/)) {
                    continue;
                }
                
                if (dateText && waterHeightText) {
                    try {
                        const datetime = parseDate(dateText);
                        // Odstranit vše kromě čísel a desetinné čárky/tečky
                        const cleanedHeightText = waterHeightText.replace(/[^\d.,]/g, '').replace(',', '.');
                        console.log(`Původní: "${waterHeightText}", Vyčištěno: "${cleanedHeightText}"`);
                        const waterHeight = parseFloat(cleanedHeightText);
                        
                        if (!isNaN(waterHeight) && datetime instanceof Date && !isNaN(datetime)) {
                            result.push({ datetime, waterHeight });
                        } else {
                            console.log(`Přeskakuji neplatné hodnoty: Datum: ${dateText}, Výška: ${waterHeightText}`);
                        }
                    } catch (e) {
                        console.error(`Chyba při zpracování řádku: ${dateText}`, e);
                    }
                }
            }
        }

        // Seřadit od nejnovějšího
        result.sort((a, b) => b.datetime - a.datetime);
        
        console.log("Zpracováno záznamů:", result.length);
        return result;
    } catch (error) {
        console.error("Chyba při načítání dat:", error);
        return [];
    }
}

function parseDate(dateString) {
    try {
        // Upraveno pro různé formáty datumu
        dateString = dateString.trim();
        
        // Kontrola formátu DD.MM.YYYY HH:MM
        const dateTimePattern = /(\d{1,2})\.(\d{1,2})\.(\d{4})\s+(\d{1,2}):(\d{1,2})/;
        const match = dateString.match(dateTimePattern);
        
        if (match) {
            const [_, day, month, year, hours, minutes] = match;
            return new Date(
                parseInt(year), 
                parseInt(month) - 1, 
                parseInt(day), 
                parseInt(hours), 
                parseInt(minutes)
            );
        }
        
        // Zkusit alternativní formáty, pokud by se změnily
        const dateParts = dateString.split(/[\s.:/]+/);
        if (dateParts.length >= 5) {
            // Předpokládáme formát DD MM YYYY HH MM
            return new Date(
                parseInt(dateParts[2]), 
                parseInt(dateParts[1]) - 1, 
                parseInt(dateParts[0]), 
                parseInt(dateParts[3]), 
                parseInt(dateParts[4])
            );
        }
        
        console.error("Nepodařilo se rozpoznat formát datumu:", dateString);
        return new Date(0); // Fallback na epoch time, což by mělo být viditelně špatně
    } catch (e) {
        console.error("Chyba při parsování datumu:", e);
        return new Date(0);
    }
}

function updateChart(chart, data) {
    if (!data || data.length === 0) {
        document.getElementById('lastRecord').innerText = "Nepodařilo se načíst data o hladině Výrovky";
        return;
    }
    
    const labels = data.map(entry => entry.datetime.toISOString());
    const values = data.map(entry => entry.waterHeight);

    const minValue = Math.min(...values) - 5;
    const maxValue = Math.max(...values) + 5;

    chart.data.labels = labels;
    chart.data.datasets[0].data = values;
    chart.options.scales.y.min = minValue;
    chart.options.scales.y.max = maxValue;
    chart.update();

    const newestRecord = data[0];
    document.getElementById('lastRecord').innerText = `Hladina Výrovky v Plaňanech. Poslední záznam: ${newestRecord.datetime.toLocaleString('cs-CZ')} - ${newestRecord.waterHeight} cm`;
}

async function main() {
    const ctx = document.getElementById('waterLevelChart').getContext('2d');
    const chart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'Hladina vody (cm)',
                data: [],
                borderColor: 'rgba(75, 192, 192, 1)',
                borderWidth: 2,
                pointRadius: 1,
                pointHoverRadius: 5,
                fill: true,
                backgroundColor: 'rgba(0, 0, 139, 0.5)', // Dark blue with 50% opacity
                tension: 0.2 // lehké vyhlazení křivky
            }]  
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true,
                    labels: {
                        color: 'white'
                    }
                },
                tooltip: {
                    mode: 'index',
                    intersect: false
                }
            },
            scales: {
                x: {
                    type: 'time',
                    time: {
                        unit: 'day',
                        tooltipFormat: 'DD.MM.yyyy HH:mm',
                        displayFormats: {
                            day: 'DD.MM.yyyy'
                        }
                    },
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    },
                    ticks: {
                        color: 'white'
                    }
                },
                y: {
                    beginAtZero: false,
                    ticks: {
                        color: 'white',
                        callback: function(value) {
                            return value + ' cm';
                        }
                    },
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    }
                }
            }
        }
    });

    // Informace o načítání
    document.getElementById('lastRecord').innerText = "Načítám data o hladině Výrovky...";

    async function fetchAndUpdate() {
        try {
            const data = await fetchData();
            updateChart(chart, data);
        } catch (error) {
            console.error("Chyba při aktualizaci grafu:", error);
            document.getElementById('lastRecord').innerText = "Chyba při načítání dat. Zkontrolujte konzoli.";
        }
    }

    await fetchAndUpdate();
    setInterval(fetchAndUpdate, 300000); // Aktualizace každých 5 minut
}

main();