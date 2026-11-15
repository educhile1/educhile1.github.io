const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const targetUrl = 'http://localhost:8080/';

async function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

function getJson(url) {
    return new Promise((resolve, reject) => {
        http.get(url, res => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try { resolve(JSON.parse(data)); } catch(e) { reject(e); }
            });
        }).on('error', reject);
    });
}

class SimpleCDP {
    constructor(wsUrl) {
        this.wsUrl = wsUrl;
        this.id = 1;
        this.callbacks = new Map();
    }
    async connect() {
        this.ws = new WebSocket(this.wsUrl);
        await new Promise((res, rej) => {
            this.ws.onopen = res;
            this.ws.onerror = rej;
        });
        this.ws.onmessage = (event) => {
            const msg = JSON.parse(event.data);
            if (msg.id && this.callbacks.has(msg.id)) {
                const cb = this.callbacks.get(msg.id);
                this.callbacks.delete(msg.id);
                if (msg.error) cb.reject(msg.error);
                else cb.resolve(msg.result);
            }
        };
    }
    send(method, params = {}) {
        const id = this.id++;
        return new Promise((resolve, reject) => {
            this.callbacks.set(id, { resolve, reject });
            this.ws.send(JSON.stringify({ id, method, params }));
        });
    }
    async eval(expr) {
        const r = await this.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
        if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
        return r.result.value;
    }
    async screenshot(filepath) {
        const r = await this.send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(filepath, Buffer.from(r.data, 'base64'));
    }
    close() {
        if (this.ws) this.ws.close();
    }
}

async function run() {
    const proc = spawn(chromePath, [
        '--headless=new',
        '--remote-debugging-port=9224',
        '--user-data-dir=' + path.resolve('.chrome-disco-temp2'),
        '--window-size=1280,820',
        '--autoplay-policy=no-user-gesture-required',
        '--disable-gpu',
        targetUrl
    ]);

    try {
        let wsUrl = null;
        for (let i = 0; i < 30; i++) {
            await sleep(500);
            try {
                const list = await getJson('http://localhost:9224/json');
                const page = list.find(t => t.type === 'page' && t.url.includes('localhost:8080'));
                if (page && page.webSocketDebuggerUrl) {
                    wsUrl = page.webSocketDebuggerUrl;
                    break;
                }
            } catch(e) {}
        }
        if (!wsUrl) throw new Error('Could not get debug ws url');

        const cdp = new SimpleCDP(wsUrl);
        await cdp.connect();
        await cdp.send('Page.enable');
        await cdp.send('Runtime.enable');

        console.log('Connected to CDP. Waiting for scene...');
        await sleep(3500);

        console.log('Playing music...');
        await cdp.eval(`
            if (window.eduSpotifyPlayer) {
                window.eduSpotifyPlayer.play();
            }
        `);

        // Wait for stage lighting and disco ball to reach peak fiesta
        console.log('Waiting for stage lighting effects...');
        await sleep(3000);

        const shot1 = path.resolve('C:\\Users\\eduar\\.gemini\\antigravity\\brain\\46645745-dee1-4ec7-a837-6ff9a1161a15\\stage-lighting-party-v2.png');
        await cdp.screenshot(shot1);
        console.log('Captured stage lighting party v2:', shot1);

        // Also take another shot 1.2s later to capture a different angle of the rotating spotlights and lasers
        await sleep(1200);
        const shot2 = path.resolve('C:\\Users\\eduar\\.gemini\\antigravity\\brain\\46645745-dee1-4ec7-a837-6ff9a1161a15\\stage-lighting-party-v2-motion.png');
        await cdp.screenshot(shot2);
        console.log('Captured stage lighting party v2 motion:', shot2);

        cdp.close();
    } finally {
        proc.kill();
        try { fs.rmSync(path.resolve('.chrome-disco-temp2'), { recursive: true, force: true }); } catch(e) {}
    }
}

run().catch(console.error);
