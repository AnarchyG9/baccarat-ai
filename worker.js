// --- worker.js (v17.0) ---

// =================================================================
// ส่วนที่ 1: ฟังก์ชันหลักจาก v16.0 (ไม่ต้องแก้ไข)
// =================================================================

// ฟังก์ชันสำหรับ Parse CSV (เพิ่มใหม่)
function parseCSV(csvText) {
    const lines = csvText.trim().split('\n');
    const data = [];
    // ข้าม header (บรรทัดแรก)
    for (let i = 1; i < lines.length; i++) {
        if (lines[i]) {
            const shoe = lines[i].split(',').map(result => result.trim());
            data.push(shoe);
        }
    }
    return data;
}

// ฟังก์ชันสร้าง Roads
function deriveRoads(shoe) {
    let bigRoad = [];
    let derivedRoads = { bigEyeRoad: [], smallRoad: [], cockroachRoad: [] };
    let counts = { P: 0, B: 0, T: 0 };
    let col = 0;
    let row = 0;
    let lastResult = null;

    if (!shoe || shoe.length === 0) {
        return { bigRoad: [], bigEyeRoad: [], smallRoad: [], cockroachRoad: [], counts: counts };
    }

    bigRoad[col] = [];

    for (let i = 0; i < shoe.length; i++) {
        let result = shoe[i];
        if (result !== 'P' && result !== 'B') {
            counts['T']++;
            if (bigRoad[col][row]) {
                bigRoad[col][row].tieCount = (bigRoad[col][row].tieCount || 0) + 1;
            }
            continue;
        }

        counts[result]++;

        if (!lastResult || lastResult === result) {
            if (lastResult) {
                row++;
            }
        } else {
            col++;
            row = 0;
            bigRoad[col] = [];
        }

        bigRoad[col][row] = { result: result, tieCount: 0 };
        lastResult = result;

        // --- Logic for Derived Roads ---
        let R = 'R';
        let B = 'B';

        // Big Eye Road
        if (col >= 1) {
            let prevCol = bigRoad[col - 1] || [];
            if (row === 0) { // check columns
                derivedRoads.bigEyeRoad.push(prevCol.length === (bigRoad[col] || []).length ? B : R);
            } else if (row === 1) {
                derivedRoads.bigEyeRoad.push(prevCol.length >= 2 ? B : R);
            }
        }

        // Small Road
        if (col >= 2) {
            let col1 = bigRoad[col - 2] || [];
            let col2 = bigRoad[col] || [];
            if (row === 0) {
                derivedRoads.smallRoad.push(col1.length === col2.length ? B : R);
            } else if (row === 1) {
                derivedRoads.smallRoad.push(col1.length >= 2 ? B : R);
            }
        }

        // Cockroach Road
        if (col >= 3) {
            let col1 = bigRoad[col - 3] || [];
            let col2 = bigRoad[col] || [];
            if (row === 0) {
                derivedRoads.cockroachRoad.push(col1.length === col2.length ? B : R);
            } else if (row === 1) {
                derivedRoads.cockroachRoad.push(col1.length >= 2 ? B : R);
            }
        }
    }

    return {
        bigRoad: bigRoad.map(col => col.map(item => item ? item.result : null).filter(Boolean)),
        bigEyeRoad: derivedRoads.bigEyeRoad,
        smallRoad: derivedRoads.smallRoad,
        cockroachRoad: derivedRoads.cockroachRoad,
        counts: counts
    };
}

// ฟังก์ชันหา Road ที่ตรงกัน
function findMatches(inputRoad, allSimulatedRoads, roadType) {
    if (!inputRoad || inputRoad.length === 0) {
        return [];
    }
    
    let matches = [];
    let inputStr = inputRoad.join('');

    for (let i = 0; i < allSimulatedRoads.length; i++) {
        let simRoad = allSimulatedRoads[i][roadType];
        if (!simRoad || simRoad.length < inputRoad.length) {
            continue;
        }

        let simStr = simRoad.join('');
        let index = simStr.indexOf(inputStr);

        if (index === 0) { // ต้องตรงกันที่จุดเริ่มต้นของ Road
            let nextElement = simRoad.length > inputRoad.length ? simRoad[inputRoad.length] : 'EndOfShoe';
            matches.push({
                shoeIndex: i,
                nextElement: nextElement
            });
        }
    }
    return matches;
}

// ฟังก์ชันคำนวณความน่าจะเป็น
function calculateNextProbabilities(matches) {
    let nextCounts = { 'R': 0, 'B': 0, 'EndOfShoe': 0 };
    let totalMatches = matches.length;

    if (totalMatches === 0) {
        return {
            totalMatches: 0,
            probabilities: { R: 0, B: 0, EndOfShoe: 0 },
            nextCounts: nextCounts
        };
    }

    for (const match of matches) {
        nextCounts[match.nextElement] = (nextCounts[match.nextElement] || 0) + 1;
    }

    return {
        totalMatches: totalMatches,
        probabilities: {
            R: (nextCounts['R'] / totalMatches) * 100,
            B: (nextCounts['B'] / totalMatches) * 100,
            EndOfShoe: (nextCounts['EndOfShoe'] / totalMatches) * 100
        },
        nextCounts: nextCounts
    };
}

// ฟังก์ชันจัดรูปแบบผลลัพธ์
function formatResult(roadName, roadString, result) {
    if (!roadString || roadString.length === 0) {
        return `--- ${roadName} ---\n(ไม่ได้ป้อนข้อมูล)\n`;
    }
    
    let output = `--- ${roadName} (Input: ${roadString}) ---\n`;
    output += `พบ ${result.totalMatches} shoes ที่ตรงกัน\n`;
    
    if (result.totalMatches > 0) {
        output += `   - R (แดง): ${result.nextCounts.R} ครั้ง (${result.probabilities.R.toFixed(2)}%)\n`;
        output += `   - B (น้ำเงิน): ${result.nextCounts.B} ครั้ง (${result.probabilities.B.toFixed(2)}%)\n`;
        output += `   - จบ Shoe: ${result.nextCounts.EndOfShoe} ครั้ง (${result.probabilities.EndOfShoe.toFixed(2)}%)\n`;
    } else {
        output += `ไม่พบข้อมูลที่ตรงกันในฐานข้อมูล 10,000 shoes\n`;
    }
    return output + "\n";
}

// ฟังก์ชันวิเคราะห์หลัก
function analyzeBaccaratRoad(inputRoadString, allSimulatedRoads) {
    const roads = inputRoadString.split(';').map(s => s.trim().toUpperCase());
    const roadInputs = {
        bigEyeRoad: (roads[0] || '').split(''),
        smallRoad: (roads[1] || '').split(''),
        cockroachRoad: (roads[2] || '').split('')
    };

    // 1. วิเคราะห์ Big Eye Road
    const bigEyeMatches = findMatches(roadInputs.bigEyeRoad, allSimulatedRoads, 'bigEyeRoad');
    const bigEyeResult = calculateNextProbabilities(bigEyeMatches);

    // 2. วิเคราะห์ Small Road
    const smallMatches = findMatches(roadInputs.smallRoad, allSimulatedRoads, 'smallRoad');
    const smallResult = calculateNextProbabilities(smallMatches);

    // 3. วิเคราะห์ Cockroach Road
    const cockroachMatches = findMatches(roadInputs.cockroachRoad, allSimulatedRoads, 'cockroachRoad');
    const cockroachResult = calculateNextProbabilities(cockroachMatches);

    // 4. จัดรูปแบบผลลัพธ์
    let finalOutput = "ผลการวิเคราะห์ (เทียบ 10,000 Shoes):\n\n";
    finalOutput += formatResult("Big Eye Road", roadInputs.bigEyeRoad.join(''), bigEyeResult);
    finalOutput += formatResult("Small Road", roadInputs.smallRoad.join(''), smallResult);
    finalOutput += formatResult("Cockroach Road", roadInputs.cockroachRoad.join(''), cockroachResult);

    return finalOutput;
}

// =================================================================
// ส่วนที่ 2: ส่วนควบคุม Worker (เพิ่มใหม่สำหรับ v17.0)
// =================================================================

let allSimulatedDerivedRoads = []; // ตัวแปรเก็บข้อมูลที่ประมวลผลแล้ว
let isReady = false;

// นี่คือ "หู" ของ Worker รอรับคำสั่งจาก app.js
self.onmessage = function(e) {
    const { type, payload } = e.data;

    if (type === 'INIT_DATA') {
        // --- คำสั่ง: เริ่มต้นระบบ ---
        console.log('Worker: ได้รับ INIT_DATA');
        try {
            // 1. Parse CSV ที่ได้รับมา
            const rawShoes = parseCSV(payload);
            console.log(`Worker: Parse ข้อมูล ${rawShoes.length} shoes สำเร็จ.`);

            // 2. สร้าง Derived Roads ทั้งหมดล่วงหน้า
            // นี่คือการคำนวณครั้งใหญ่ที่สุด ทำแค่ครั้งเดียว
            allSimulatedDerivedRoads = rawShoes.map(shoe => {
                const roads = deriveRoads(shoe);
                return {
                    // เราเก็บเฉพาะ derived roads ที่จะใช้
                    bigEyeRoad: roads.bigEyeRoad,
                    smallRoad: roads.smallRoad,
                    cockroachRoad: roads.cockroachRoad
                };
            });

            isReady = true;
            console.log('Worker: สร้าง Derived Roads ทั้งหมดเสร็จแล้ว. พร้อมทำงาน!');

            // 3. ส่งข้อความบอก app.js ว่า "พร้อมแล้ว"
            self.postMessage({ type: 'WORKER_READY' });

        } catch (error) {
            console.error('Worker: เกิด Error ตอนประมวลผล CSV', error);
            self.postMessage({ type: 'ANALYSIS_ERROR', payload: `Worker Error: ${error.message}` });
        }

    } else if (type === 'ANALYZE_ROAD') {
        // --- คำสั่ง: วิเคราะห์ Road ---
        if (!isReady) {
            console.warn('Worker: ได้รับคำสั่งวิเคราะห์ แต่ยังไม่พร้อม');
            self.postMessage({ type: 'ANALYSIS_ERROR', payload: 'Worker ยังไม่พร้อม (กำลังโหลดข้อมูล)' });
            return;
        }

        try {
            console.log(`Worker: กำลังวิเคราะห์ Road: ${payload}`);
            // 1. เรียกใช้ฟังก์ชันวิเคราะห์ที่เรามีอยู่แล้ว
            const resultString = analyzeBaccaratRoad(payload, allSimulatedDerivedRoads);
            
            // 2. ส่งผลลัพธ์ (ที่เป็น string) กลับไปที่ app.js
            self.postMessage({
                type: 'ANALYSIS_RESULT',
                payload: resultString
            });

        } catch (error) {
            console.error('Worker: เกิด Error ตอนวิเคราะห์', error);
            self.postMessage({ type: 'ANALYSIS_ERROR', payload: `Analysis Error: ${error.message}` });
        }
    }
};
