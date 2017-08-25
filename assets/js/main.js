const fromSelect = document.getElementById('from');
const toSelect = document.getElementById('to');
fromSelect.addEventListener('change', function () {
    getGraphicData('temperature', fromSelect.value, toSelect.value).then(data => renderYearData(data, {max:30, min:-40}));
});
toSelect.addEventListener('change', function () {
    getGraphicData('temperature', fromSelect.value, toSelect.value).then(data => renderYearData(data, {max:30, min:-40}));
});

const CANVAS_SIZE = 600;
const MIN_YEAR = 1881;
const MAX_YEAR = 2006;
const segmentsTreesCache = {};
const monthDays = [31, 0, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function getDayCount(month, year) {
    return monthDays[month] || (!year % 4 && year % 100 || !year % 400) ? 29 : 28
}
const ctx  = document.getElementById("chart").getContext("2d");
function renderYearData(data, options) {
    console.log(data)
    data.push(data[0])
    ctx.clearRect(0,0,600,600);
    ctx.beginPath();
    ctx.setLineDash([]);
    const { max, min } = options;
    const first = data[0];
    ctx.lineWidth = 1;
    ctx.moveTo(0, (max - first)/(max - min)*CANVAS_SIZE);

    console.log(0, (max - first)/(max - min)*CANVAS_SIZE);
    for(let i = 0; i < data.length; i++) {
        let x = (i) / (data.length-1) * CANVAS_SIZE;
        let y = (max - data[i])/(max - min) * CANVAS_SIZE;
        ctx.lineTo(x, y);
    }
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.beginPath();
    ctx.setLineDash([1, 10]);
    ctx.moveTo(0, max/(max - min)*CANVAS_SIZE);
    ctx.lineTo(CANVAS_SIZE, max/(max - min)*CANVAS_SIZE);
    ctx.stroke();


    for(let i = 0; i < data.length; i++) {
        let x = (i) / (data.length-1)* CANVAS_SIZE;
        let y = (max - data[i])/(max - min) * CANVAS_SIZE;
        ctx.fillStyle="#0f0";
        // ctx.arc(x, y, 3, 0, 2 * Math.PI, true);
        ctx.fillRect(x+1, y+1, 30, 15);
        ctx.fillStyle="#000";
        ctx.fillText(data[i].toFixed(1),x+6,y+11);

        ctx.beginPath();
        ctx.arc(x, y, 2, 0, 2 * Math.PI, true);
        ctx.fillStyle = '#000';
        ctx.fill();
        ctx.stroke();
    }
}

var data = [6, 3, 4, 5, 8, 32, 0, 20, 25];
var max = 50;
var min = -20;

function getGraphicData(dataKey, from, to) {
    return getSegmentsTree(dataKey).then(tree => computeAverage(tree, from-MIN_YEAR, to-MIN_YEAR))
}

function computeAverage(data, from, to) {
    data = data.slice(from, to + 1);
    return data.reduce(
        (memo, yearData) => {
            yearData.forEach((v, i) => {
                memo[i] += v;

            });
            return memo;
        },
        new Array(12).fill(0)
    ).map(v => v / data.length)
}

function getSegmentsTree(dataKey) {
    if (!segmentsTreesCache[dataKey]) {
        segmentsTreesCache[dataKey] = loadDataFromStore(dataKey)//.then(buildSegementTree);
    }

    return segmentsTreesCache[dataKey];
}

function loadDataFromStore(dataKey) {
    return fetch('/d/' + dataKey + '.json')
        .then(response => response.json())
        .then(rawData => {
            const length = MAX_YEAR - MIN_YEAR + 1;
            const result = new Array(length);
            for(let i = 0; i < rawData.length; i++) {
                let current = rawData[i];
                let [year, month] = current.t.split('-');
                year = year - MIN_YEAR;
                --month;
                if(!result[year]) {
                    result[year] = new Array(12).fill(0);
                }
                result[year][month] += current.v
            }

            return result;
        })
        .then(sumData => {
            for(let i = 0; i < sumData.length; i++) {
                const year = i + MIN_YEAR;
                sumData[i] = sumData[i].map((sum, month) => sum / getDayCount(month, year))
            }
            return sumData;
        })
}

function buildSegementTree(data) {

}

getGraphicData('temperature', MIN_YEAR, MAX_YEAR).then(data => renderYearData(data, {max:30, min:-40}));


