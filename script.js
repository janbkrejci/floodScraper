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
        
        // Modernější, flexibilnější způsob hledání tabulky s daty
        // Hledáme tabulku, která obsahuje údaje o vodním stavu
        const tables = Array.from(doc.querySelectorAll('table'));
        let dataTable = null;
        
        // Hledáme tabulku s daty o vodním stavu
        for (const table of tables) {
            const headerText = table.textContent.toLowerCase();
            if (headerText.includes('datum') && (headerText.includes('stav') || headerText.includes('průtok'))) {
                dataTable = table;
                break;
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
        
        // Přeskočit první řádek, který je pravděpodobně záhlaví
        for (let i = 1; i < rows.length; i++) {
            const cells = rows[i].querySelectorAll('td');
            if (cells.length >= 2) {
                const dateText = cells[0].innerText.trim();
                const waterHeightText = cells[1].innerText.trim().replace(',', '.');
                
                if (dateText && waterHeightText) {
                    const datetime = parseDate(dateText);
                    const waterHeight = parseFloat(waterHeightText);
                    
                    if (!isNaN(waterHeight) && datetime instanceof Date && !isNaN(datetime)) {
                        result.push({ datetime, waterHeight });
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