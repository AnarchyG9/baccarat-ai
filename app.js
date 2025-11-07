// --- app.js (v17.0) ---

document.addEventListener('DOMContentLoaded', () => {
    // เชื่อมต่อ UI Elements
    const roadInput = document.getElementById('roadInput');
    const analyzeButton = document.getElementById('analyzeButton');
    const resultDiv = document.getElementById('result');
    const statusDiv = document.getElementById('status');

    let myWorker;
    let isWorkerReady = false;

    // 1. ฟังก์ชันเริ่มต้นระบบ (โหลดข้อมูล และ สร้าง Worker)
    async function initializeAnalyzer() {
        statusDiv.textContent = '🔄 กำลังโหลดข้อมูล Simulation (10,000 shoes)...';
        analyzeButton.disabled = true;

        try {
            // 1a. ดึงข้อมูล CSV (ทำได้เพราะเรารันบน GitHub Pages)
            const response = await fetch('baccarat_sim_10000.csv');
            if (!response.ok) {
                throw new Error(`ไม่สามารถโหลดไฟล์ CSV: ${response.statusText}`);
            }
            const csvData = await response.text();
            statusDiv.textContent = '🔄 โหลดข้อมูล CSV สำเร็จ! กำลังส่งให้ Worker...';

            // 1b. สร้าง Worker
            myWorker = new Worker('worker.js');

            // 1c. ส่งข้อมูล CSV ทั้งก้อนไปให้ Worker
            // เราส่งเป็น object เพื่อให้ worker รู้ว่านี่คือ "ข้อมูลตั้งต้น"
            myWorker.postMessage({
                type: 'INIT_DATA',
                payload: csvData
            });

            // 1d. ตั้งค่าการ "รอฟัง" ข้อความจาก Worker
            myWorker.onmessage = (e) => {
                const { type, payload } = e.data;

                if (type === 'WORKER_READY') {
                    // Worker ประมวลผลข้อมูล CSV เสร็จแล้ว
                    isWorkerReady = true;
                    analyzeButton.disabled = false;
                    analyzeButton.textContent = 'Analyze';
                    statusDiv.textContent = '✅ ระบบพร้อมวิเคราะห์ (10,000 shoes loaded)';
                } else if (type === 'ANALYSIS_RESULT') {
                    // Worker ส่งผลการวิเคราะห์กลับมา
                    resultDiv.innerHTML = `<pre>${payload}</pre>`;
                } else if (type === 'ANALYSIS_ERROR') {
                    // Worker ส่งข้อผิดพลาดกลับมา
                    resultDiv.innerHTML = `<p style="color: red;">${payload}</p>`;
                }
            };

            // 1e. จัดการ Error ของ Worker
            myWorker.onerror = (err) => {
                console.error('Worker error:', err);
                statusDiv.textContent = `❌ เกิดข้อผิดพลาดร้ายแรงใน Worker: ${err.message}`;
            };

        } catch (error) {
            console.error('Failed to initialize:', error);
            statusDiv.textContent = `❌ ไม่สามารถเริ่มต้นระบบได้: ${error.message}`;
        }
    }

    // 2. ตั้งค่าปุ่ม "Analyze"
    analyzeButton.addEventListener('click', () => {
        if (!isWorkerReady || !myWorker) {
            resultDiv.textContent = 'โปรดรอ... ระบบยังไม่พร้อม';
            return;
        }

        const roadString = roadInput.value.trim();
        if (roadString === '') {
            resultDiv.textContent = 'กรุณาป้อน Road ที่ต้องการวิเคราะห์';
            return;
        }

        // ส่ง Road ที่ผู้ใช้ป้อน ไปให้ Worker
        myWorker.postMessage({
            type: 'ANALYZE_ROAD',
            payload: roadString
        });

        resultDiv.textContent = '🔄 กำลังวิเคราะห์...';
    });

    // 3. เริ่มต้นระบบทันทีที่หน้าเว็บโหลดเสร็จ
    initializeAnalyzer();
});
