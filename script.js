async function fetchData() {
    try {
        const proxyUrl = 'https://corsproxy.io/?';
        const targetUrl = 'https://hydro.chmi.cz/hppsoldv/hpps_prfdata.php?seq=307024';
        
        const response = await fetch(proxyUrl + encodeURIComponent(targetUrl));
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const text = await response.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(text, 'text/html');
        
        let dataTable = null;
        
        const tborderDivs = doc.querySelectorAll('div.tborder.center_text');
        if (tborderDivs.length > 0) {
            const tables = tborderDivs[0].querySelectorAll('table');
            if (tables.length > 0) {
                dataTable = tables[0];
            }
        }
        
        if (!dataTable) {
            const tables = Array.from(doc.querySelectorAll('table'));
            for (const table of tables) {
                const headers = table.querySelectorAll('th');
                let hasDateHeader = false;
                let hasWaterLevelHeader = false;
                let hasFlowHeader = false;
                
                for (const header of headers) {
                    const headerText = header.textContent.trim().toLowerCase();
                    if (headerText.includes('datum a čas')) {
                        hasDateHeader = true;
                    }
                    if (headerText.includes('stav [cm]')) {
                        hasWaterLevelHeader = true;
                    }
                    if (headerText.includes('průtok')) {
                        hasFlowHeader = true;
                    }
                }
                
                if (hasDateHeader && hasWaterLevelHeader && hasFlowHeader) {
                    dataTable = table;
                    break;
                }
            }
        }
        
        if (!dataTable) {
            const tables = Array.from(doc.querySelectorAll('table'));
            for (const table of tables) {
                const rows = table.querySelectorAll('tr');
                if (rows.length < 5) continue;
                
                let validRows = 0;
                
                for (let i = 1; i < Math.min(rows.length, 5); i++) {
                    const cells = rows[i].querySelectorAll('td');
                    if (cells.length >= 3) {
                        const dateText = cells[0].textContent.trim();
                        if (/\d{2}\.\d{2}\.\d{4}/.test(dateText)) {
                            validRows++;
                        }
                    }
                }
                
                if (validRows >= 3) {
                    dataTable = table;
                    break;
                }
            }
        }

        if (!dataTable) {
            return [];
        }
        
        const rows = dataTable.querySelectorAll('tr');
        const result = [];

        let startIndex = 0;
        const firstRowCells = rows[0].querySelectorAll('th');
        if (firstRowCells.length > 0) {
            startIndex = 1;
        }

        for (let i = startIndex; i < rows.length; i++) {
            const cells = rows[i].querySelectorAll('td');
            if (cells.length >= 3) {
                const dateText = cells[0].innerText.trim();
                const waterHeightText = cells[1].innerText.trim();
                
                if (!dateText.match(/\d{2}\.\d{2}\.\d{4}/) && !dateText.match(/\d{1,2}\.\d{1,2}\.\d{4}/)) {
                    continue;
                }
                
                if (dateText && waterHeightText) {
                    try {
                        const datetime = parseDate(dateText);
                        const cleanedHeightText = waterHeightText.replace(/[^\d.,]/g, '').replace(',', '.');
                        const waterHeight = parseFloat(cleanedHeightText);
                        
                        if (!isNaN(waterHeight) && datetime instanceof Date && !isNaN(datetime)) {
                            result.push({ datetime, waterHeight });
                        }
                    } catch (e) {
                    }
                }
            }
        }

        result.sort((a, b) => b.datetime - a.datetime);
        
        return result;
    } catch (error) {
        return [];
    }
}

function parseDate(dateString) {
    try {
        dateString = dateString.trim();
        
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
        
        const dateParts = dateString.split(/[\s.:/]+/);
        if (dateParts.length >= 5) {
            return new Date(
                parseInt(dateParts[2]), 
                parseInt(dateParts[1]) - 1, 
                parseInt(dateParts[0]), 
                parseInt(dateParts[3]), 
                parseInt(dateParts[4])
            );
        }
        
        return new Date(0);
    } catch (e) {
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
                backgroundColor: 'rgba(0, 0, 139, 0.5)',
                tension: 0.2
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

    document.getElementById('lastRecord').innerText = "Načítám data o hladině Výrovky...";

    async function fetchAndUpdate() {
        try {
            const data = await fetchData();
            updateChart(chart, data);
        } catch (error) {
            document.getElementById('lastRecord').innerText = "Chyba při načítání dat.";
        }
    }

    await fetchAndUpdate();
    setInterval(fetchAndUpdate, 300000);
}

main();