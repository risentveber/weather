const activeDropdown = {};
const CANVAS_SIZE = 600;
const MIN_YEAR = 1881;
const MAX_YEAR = 2006;
const renderState = {
    from: MIN_YEAR,
    to: MAX_YEAR,
    dataType: 'temperature'
};
const dataConfigs = {
    temperature: {
        max: 50,
        min: -50
    },
    precipitation: {
        max: 100,
        min: -10
    }
};
/* -------------------- DB logic --------------------- */
function connectDB() {
    return new Promise((resolve, reject) => {
        const request = window.indexedDB.open('meteohistory', 1);
        request.onerror = err => {
            console.error('DB::connection error', err);
            reject(err);
        };

        request.onsuccess = event => {
            console.log('DB::connection established');
            resolve(event.target.result);
        };

        request.onupgradeneeded = event => {
            console.log('DB::processing upgrade');
            const result = event.currentTarget.result;
            result.createObjectStore('temperature', { autoIncrement: true });
            result.createObjectStore('precipitation', { autoIncrement: true });
        };
    });
}
const dbConnection = connectDB();
function loadDataFromDB(dataKey) {
    return dbConnection.then(db => new Promise((resolve, reject) => {
        const transaction = db.transaction([dataKey], 'readonly');
        const objectStore = transaction.objectStore(dataKey);

        const cursor = objectStore.openCursor();
        const data = [];

        cursor.onsuccess = event => {
            const result = event.target.result;
            if(result) {
                console.log('DB::chunk loaded', result.value);
                data.push(result.value);
                result.continue();
            } else {
                resolve(data);
            }
        };

        cursor.onerror = error => {
            console.log('DB::fetch data error', error);
            reject(error);
        };
    }));
}

function storeDataInDB(dataKey, data) {
    return dbConnection.then(db => new Promise((resolve, reject) => {
        const transaction = db.transaction(dataKey, 'readwrite');
        const store = transaction.objectStore(dataKey);
        let i = 0;

        function putNext() {
            if (i < data.length) {
                const storeRequest = store.put(data[i]);
                storeRequest.onsuccess = putNext;
                storeRequest.onerror = reject;
                ++i;
            } else {   // complete
                console.log('DB::populate complete');
                resolve();
            }
        }
        putNext();
    }));
}
/* ---------------- render logic --------------------- */
const dataMainCache = {};
const monthDays = [31, 0, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function getDayCount(month, year) {
    return monthDays[month] || (!year % 4 && year % 100 || !year % 400) ? 29 : 28;
}
const ctx  = document.getElementById('chart').getContext('2d');
function renderYearData(data, options) {
    ctx.clearRect(0, 0, 600, 600);
    ctx.beginPath();
    ctx.setLineDash([]);
    const { max, min } = options;
    const first = data[0];
    ctx.lineWidth = 1;
    ctx.moveTo(1 / (data.length + 1) * CANVAS_SIZE, (max - first) / (max - min) * CANVAS_SIZE);

    for(let i = 0; i < data.length; i++) {
        const x = (i + 1) / (data.length + 1) * CANVAS_SIZE;
        const y = (max - data[i]) / (max - min) * CANVAS_SIZE;
        ctx.lineTo(x, y);
    }
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.beginPath();
    ctx.setLineDash([1, 10]);
    const yParts = (max - min) / 10;
    for(let y = 1; y < yParts; y++) {
        ctx.fillText(((1 - y / yParts) * (max - min) + min).toFixed(1), 5, 3 + y / yParts * CANVAS_SIZE);
        ctx.moveTo(30, (1 - y / yParts) * CANVAS_SIZE);
        ctx.lineTo(CANVAS_SIZE, (1 - y / yParts) * CANVAS_SIZE);
    }
    ctx.stroke();


    for(let i = 0; i < data.length; i++) {
        const x = (i + 1) / (data.length + 1) * CANVAS_SIZE;
        const y = (max - data[i]) / (max - min) * CANVAS_SIZE;
        ctx.fillStyle = '#b4c693';
        ctx.fillRect(x + 1, y + 1, 30, 15);
        ctx.fillStyle = '#000';
        ctx.fillText(data[i].toFixed(1), x + 6, y + 11);

        ctx.beginPath();
        ctx.arc(x, y, 2, 0, 2 * Math.PI, true);
        ctx.fillStyle = '#000';
        ctx.fill();
        ctx.stroke();
    }
}
function getCachedData(dataKey) {
    if (!dataMainCache[dataKey]) {
        dataMainCache[dataKey] = loadDataFromStore(dataKey);
    }

    return dataMainCache[dataKey];
}

function computeAverage(data, from, to) {
    const dataRanged = data.slice(from, to + 1);

    return dataRanged.reduce(
        (memo, yearData) => {
            yearData.forEach((v, i) => {
                memo[i] += v;
            });
            return memo;
        },
        new Array(12).fill(0)
    ).map(v => v / dataRanged.length);
}

function getGraphicData(dataKey, from, to) {
    return getCachedData(dataKey).then(tree => computeAverage(tree, from - MIN_YEAR, to - MIN_YEAR));
}

function loadFromServer(dataKey) {
    return window.fetch('/d/' + dataKey + '.json')
        .then(response => response.json())
        .then(rawData => {
            const length = MAX_YEAR - MIN_YEAR + 1;
            const result = new Array(length);
            for(let i = 0; i < rawData.length; i++) {
                const current = rawData[i];
                let [year, month] = current.t.split('-');
                year = year - MIN_YEAR;
                --month;
                if(!result[year]) {
                    result[year] = new Array(12).fill(0);
                }
                result[year][month] += current.v;
            }

            return result;
        })
        .then(sumData => {
            for(let i = 0; i < sumData.length; i++) {
                const year = i + MIN_YEAR;
                sumData[i] = sumData[i].map((sum, month) => dataKey === 'temperature' ? sum / getDayCount(month, year) : sum);
            }
            return sumData;
        });
}

function loadDataFromStore(dataKey) {
    return loadDataFromDB(dataKey).then(data => {
        if (data.length) {
            return data;
        }
        const fetchPromise = loadFromServer(dataKey);
        fetchPromise.then(loadedData => storeDataInDB(dataKey, loadedData));
        return fetchPromise;
    });
}

/* --------------------- UI logic ---------------------------------- */
const fromDropdown = document.getElementById('from');
const toDropdown = document.getElementById('to');
const rerender = () => getGraphicData(renderState.dataType, renderState.from, renderState.to)
    .then(data => renderYearData(data, dataConfigs[renderState.dataType]));
rerender();
const buttons = Array.from(document.getElementsByTagName('button'));

buttons.forEach(elem => {
    elem.addEventListener('click', function changeDataType() {
        buttons.forEach(button => {
            if (this.value === button.value) {
                button.classList.add('active');
            } else {
                button.classList.remove('active');
            }
        });
        renderState.dataType = this.value;
        rerender();
    });
});

function showAvailableYears() {
    const fromIndex = renderState.from - MIN_YEAR;
    const toIndex = renderState.to - MIN_YEAR;
    Array.from(toDropdown.children[2].children).forEach((liItem, index)=> {
        liItem.style.display = index < fromIndex ? 'none' : 'list-item';
    });
    Array.from(fromDropdown.children[2].children).forEach((liItem, index)=> {
        liItem.style.display = index > toIndex ? 'none' : 'list-item';
    });
}

function showDropdown(event) {
    if (activeDropdown.id && activeDropdown.id !== event.target.id) {
        activeDropdown.element.classList.remove('active');
    }
    // checking if a list element was clicked, changing the inner button value
    if (event.target.tagName === 'LI') {
        activeDropdown.button.innerHTML = event.target.innerHTML;
        if (fromDropdown.contains(event.target)) {
            renderState.from = Number(event.target.innerHTML);
        } else {
            renderState.to = Number(event.target.innerHTML);
        }
        rerender();
        showAvailableYears();

        const children = event.target.parentNode.children;
        for (let i = 0; i < children.length; i++) {
            if (children[i].classList.contains('check')) {
                children[i].classList.remove('check');
            }
        }
        // timeout here so the check is only visible after opening the dropdown again
        window.setTimeout(() => event.target.classList.add('check'), 500);
    }
    for (let i = 0; i < this.children.length; i++) {
        if (this.children[i].classList.contains('dropdown-selection')) {
            activeDropdown.id = this.id;
            activeDropdown.element = this.children[i];
            this.children[i].classList.add('active');
        } else if (this.children[i].classList.contains('dropdown-button')) {
            // adding the dropdown-button to our object
            activeDropdown.button = this.children[i];
        }
    }
}

fromDropdown.addEventListener('click', showDropdown);
toDropdown.addEventListener('click', showDropdown);
Array.from(document.getElementsByClassName('dropdown-selection')).forEach(elem => {
    elem.innerHTML = new Array(MAX_YEAR - MIN_YEAR + 1).fill(0).map((_, i) => '<li>' + (i + MIN_YEAR) + '</li>').join('');
});

window.onclick = function closeDropdown(event) {
    if (!event.target.classList.contains('dropdown-button')) {
        activeDropdown.element && activeDropdown.element.classList.remove('active');
    }
};
