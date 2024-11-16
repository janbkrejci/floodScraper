async function fetchData() {
    const proxyUrl = 'https://corsproxy.io/?';
    const targetUrl = 'https://hydro.chmi.cz/hppsoldv/hpps_prfdata.php?seq=307024';
    const response = await fetch(proxyUrl + encodeURIComponent(targetUrl));
    const text = await response.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(text, 'text/html');
    const table = doc.querySelector('#page .box .cont table:nth-of-type(2) tbody tr:nth-of-type(4) td div table');
    const rows = table.querySelectorAll('tr');
    const result = [];

    rows.forEach((row, index) => {
        if (index === 0) return; // Přeskočit řádek záhlaví
        const cells = row.querySelectorAll('td');
        if (cells.length > 1) {
            const datetime = parseDate(cells[0].innerText.trim());
            const waterHeight = parseFloat(cells[1].innerText.trim());
            if (!isNaN(waterHeight)) {
                result.push({ datetime, waterHeight });
            }
        }
    });

    return result;
}

function parseDate(dateString) {
    const [datePart, timePart] = dateString.split(' ');
    const [day, month, year] = datePart.split('.').map(Number);
    const [hours, minutes] = timePart.split(':').map(Number);
    return new Date(year, month - 1, day, hours, minutes);
}

function updateChart(chart, data) {
    const labels = data.map(entry => entry.datetime.toISOString());
    const values = data.map(entry => entry.waterHeight);

    const minValue = Math.min(...values) - 5;
    const maxValue = Math.max(...values) + 5;

    chart.data.labels = labels;
    chart.data.datasets[0].data = values;
    chart.options.scales.y.min = minValue;
    chart.options.scales.y.max = maxValue;
    chart.update();
}

async function main() {
    const ctx = document.getElementById('waterLevelChart').getContext('2d');
    const chart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'Hladina vody',
                data: [],
                borderColor: 'rgba(75, 192, 192, 1)',
                borderWidth: 1,
                pointRadius: 0,
                fill: true,
                backgroundColor: 'rgba(0, 0, 139, 0.5)', // Dark blue with 50% opacity
            }]  
        },
        options: {
            plugins: {
                legend: {
                    display: false
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
                        },
                        grid: {
                            color: '#222'
                        }
                    },
                },
                y: {
                    beginAtZero: false,
                    ticks: {
                        callback: function(value) {
                            return value + ' cm';
                        }
                    },
                    grid: {
                        color: '#222'
                    }
                }
            }
        }
    });

    async function fetchAndUpdate() {
        const data = await fetchData();
        updateChart(chart, data);
    }

    fetchAndUpdate();
    setInterval(fetchAndUpdate, 60000);
}

main();
