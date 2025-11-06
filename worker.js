/* ========== PART 3: AI BRAIN (WEB WORKER) ========== */
/*
 * นี่คือ "สมอง AI" (God-Tier) ฉบับสมบูรณ์
 * (ฉบับแก้ไข: v12 - META-MIND (Weighted Voting))
 * ทำหน้าที่: คำนวณตรรกะ AI ทั้งหมด, จัดการฐานข้อมูล (IndexedDB)
 * มันทำงานแยกขาดจาก "หน้าจอ" (UI) โดยสิ้นเชิง
 */

"use strict";

// ========== 1. AI CONFIGURATION (แก้แผล "บำรุงรักษา") ==========
const AI_CONFIG = {
    // (1-9) ค่าเริ่มต้น (จะถูกแปลงเป็น "คะแนน")
    TRIGGER_THRESHOLD: 5,
    
    // (‼️‼️ เพิ่ม: META-MIND CONFIG ‼️‼️)
    USE_META_MIND: false, // (ปิดเป็นค่าเริ่มต้น)
    META_MIND_DEFAULT_WEIGHT: 0.50, // (น้ำหนักเริ่มต้นสำหรับ Expert ที่ "ยังไม่เคย" โหวต)
    META_MIND_MIN_VOTES: 20, // (Expert ต้องมีประวัติโหวตอย่างน้อย 20 ครั้ง ก่อนที่เราจะ "เชื่อ" Winrate ของมัน)
    META_MIND_NORMALIZATION_FACTOR: 0.55, // (ค่าคงที่สำหรับแปลง Slider 1-9 -> คะแนน (Score))

    // (แก้แผล "Memory Leak") - รีสตาร์ทสมองทุกๆ กี่ตา
    MEMORY_RESTART_INTERVAL: 0 // (0 = ปิด)
};

let CONFIG = {}; // (ประกาศตัวแปร CONFIG)
// (‼️‼️ เพิ่ม: ที่เก็บ "สัญชาตญาณ" ‼️‼️)
let EXPERT_WEIGHTS = {};


// ========== 2. GENESIS BLOCK (แก้แผล "AI โง่วันแรกเกิด") ==========
// (ฝังข้อมูล 100 ตา ที่ได้จาก 1000 ตา ของคุณ)
// (นี่คือ `P_UNKNOWN`, `B_UNKNOWN`, `T`)
const GENESIS_BLOCK_DATA = [
    'P','B','B','P','P','P','B','B','T','B','P','B','P','B','P','P',
    'B','B','B','B','P','P','P','P','B','P','B','P','P','B','B','B',
    'P','T','P','P','P','B','B','P','B','P','P','B','P','P','B','B',
    'P','P','B','B','B','B','P','P','P','B','P','B','T','P','B','P',
    'B','P','P','B','P','B','P','P','P','B','B','B','P','P','B','P',
    'B','P','B','B','B','B','B','P','T','P','P','B','P','B','B','P',
    'B','P','P'
];


// ========== 3. DATABASE (IndexedDB) SETUP ==========
let DB = null;
const DB_NAME = "OC_Baccarat_AI_DB";
const DB_VERSION = 10; 

function initDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (db.objectStoreNames.contains('game_history')) db.deleteObjectStore('game_history');
            if (db.objectStoreNames.contains('global_stats')) db.deleteObjectStore('global_stats');
            if (db.objectStoreNames.contains('expert_performance')) db.deleteObjectStore('expert_performance');
            if (db.objectStoreNames.contains('shoe_meta')) db.deleteObjectStore('shoe_meta');
            
            const historyStore = db.createObjectStore('game_history', { keyPath: 'id', autoIncrement: true });
            historyStore.createIndex('shoe_index', 'shoe', { unique: false });
            historyStore.createIndex('result_index', 'result', { unique: false });
            
            db.createObjectStore('global_stats', { keyPath: 'key' });
            db.createObjectStore('expert_performance', { keyPath: 'expertName' });
            db.createObjectStore('shoe_meta', { keyPath: 'id', autoIncrement: true });
        };

        request.onsuccess = (event) => {
            DB = event.target.result;
            console.log("WORKER: 'สมอง' (IndexedDB) เชื่อมต่อสำเร็จ");
            resolve(DB);
        };
        request.onerror = (event) => {
            console.error("WORKER: DB Error:", event.target.error);
            postMessage({ command: 'FATAL_ERROR_FROM_WORKER', message: `DB Error: ${event.target.error}` });
            reject(event.target.error);
        };
    });
}
function getStore(storeName, mode = 'readonly') {
    if (!DB) throw new Error("DB is not initialized");
    const transaction = DB.transaction(storeName, mode);
    return transaction.objectStore(storeName);
}
// (Helper Functions: safeWrite, safeAdd, safeGet, safeGetAll, safeDelete)
function safeWrite(storeName, data) {
    return new Promise((resolve, reject) => {
        try {
            const tx = DB.transaction(storeName, 'readwrite');
            const store = tx.objectStore(storeName);
            const req = store.put(data);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        } catch (e) {
            reject(e);
        }
    });
}
function safeAdd(storeName, data) {
     return new Promise((resolve, reject) => {
         try {
            const tx = DB.transaction(storeName, 'readwrite');
            const store = tx.objectStore(storeName);
            const req = store.add(data);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
         } catch (e) {
             reject(e);
         }
    });
}
function safeGet(storeName, key) {
     return new Promise((resolve, reject) => {
        try {
            const store = getStore(storeName, 'readonly');
            const req = store.get(key);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        } catch (e) {
            reject(e);
        }
    });
}
function safeGetAll(storeName) {
     return new Promise((resolve, reject) => {
         try {
            const store = getStore(storeName, 'readonly');
            const req = store.getAll();
            req.onsuccess = () => resolve(req.result || []);
            req.onerror = () => reject(req.error);
         } catch (e) {
             reject(e);
         }
    });
}
function safeDelete(storeName, key) {
     return new Promise((resolve, reject) => {
         try {
            const tx = DB.transaction(storeName, 'readwrite');
            const store = tx.objectStore(storeName);
            const req = store.delete(key);
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
         } catch (e) {
             reject(e);
         }
    });
}

// ========== 4. CORE LOGIC: ACTIONS (การกระทำ) ==========

// (เมื่อผู้ใช้กดปุ่ม)
async function addHand(result, lastSignal) {
    await checkMemoryRestart();
    
    const currentShoeId = await getCurrentShoeId();
    
    let signalWin = null; 
    const finalPred = lastSignal.finalPrediction;
    const actualResult = result[0];
    
    if (finalPred && finalPred !== 'WAIT' && finalPred !== 'T' && actualResult !== 'T') {
        signalWin = (finalPred === actualResult); 
    }
    
    const handData = {
        result: result,
        shoe: currentShoeId,
        timestamp: Date.now(),
        lastSignal: lastSignal, // (บันทึก "โหวต" ทั้งหมด)
        signalWin: signalWin    
    };
    
    const newHandId = await safeAdd('game_history', handData);
    
    // (‼️‼️ อัปเกรด: "เรียนรู้" หลังเพิ่มข้อมูล ‼️‼️)
    // (เรา "ไม่" (do not) await ที่นี่ เพื่อให้ UI ตอบสนองเร็ว)
    // (มันจะอัปเดตสถิติในพื้นหลัง)
    Promise.all([
        updateGlobalStats(handData),
        updateExpertPerformance(handData)
    ]).then(() => {
        // (เมื่อเรียนรู้เสร็จ ให้ "คำนวณ" น้ำหนักใหม่)
        calculateExpertWeights();
    });
    
    // 5. วิเคราะห์ตาถัดไป
    return runAnalysis(newHandId);
}

// (เมื่อผู้ใช้กด UNDO)
async function undoLastHand() {
    const tx = DB.transaction(['game_history', 'global_stats', 'expert_performance'], 'readwrite');
    const store_game = tx.objectStore('game_history');
    
    return new Promise(async (resolve, reject) => {
        const cursorReq = store_game.openCursor(null, 'prev');
        
        cursorReq.onsuccess = async (event) => {
            const cursor = event.target.result;
            if (cursor) {
                const handToRemove = cursor.value;
                
                // (‼️‼️ อัปเกรด: "ย้อนการเรียนรู้" ‼️‼️)
                // (ต้อง await ที่นี่ เพราะมันสำคัญ)
                await reverseGlobalStats(handToRemove);
                await reverseExpertPerformance(handToRemove);

                const deleteReq = cursor.delete();
                deleteReq.onerror = (e) => reject(e.target.error);
            }
        };
        cursorReq.onerror = (e) => reject(e.target.error);
        
        tx.oncomplete = () => {
             // (เมื่อย้อนเสร็จ ให้ "คำนวณ" น้ำหนักใหม่)
             calculateExpertWeights().then(() => {
                 runAnalysis(null).then(resolve).catch(reject);
             });
        };
        tx.onerror = (e) => reject(e.target.error);
    });
}

// (เมื่อผู้ใช้กด "เริ่มขอนใหม่")
async function newShoe() {
    await safeAdd('shoe_meta', { startTime: Date.now() });
    return runAnalysis(null);
}

// (เมื่อผู้ใช้ "แก้ไขประวัติ")
async function editHistory(handId, newResult) {
    const oldData = await safeGet('game_history', handId);
    if (oldData) {
        const newData = { ...oldData, result: newResult };
        
        await reverseGlobalStats(oldData);
        await updateGlobalStats(newData);
        await reverseExpertPerformance(oldData);
        
        await safeWrite('game_history', newData);
        
        // (เมื่อแก้ไขเสร็จ ให้ "คำนวณ" น้ำหนักใหม่)
        await calculateExpertWeights();
        return runAnalysis(handId);
    } else {
        throw new Error("ไม่พบ ID ที่ต้องการแก้ไข");
    }
}

// (เมื่อเปิดแอป)
async function loadLastState() {
    const needsGenesis = await checkGenesisBlock();
    if (needsGenesis) {
        postMessage({ command: 'RETRAIN_PROGRESS', progress: 10, message: "ตรวจพบบการใช้งานครั้งแรก... กำลังโหลด 'บล็อกกำเนิด' (Genesis Block)..." });
        await runGenesisBlock();
        postMessage({ command: 'RETRAIN_COMPLETE' });
    }
    
    // (‼️‼️ เพิ่ม: "คำนวณสัญชาตญาณ" ตอนเปิดแอป ‼️‼️)
    await calculateExpertWeights();
    
    return runAnalysis(null);
}

// (‼️‼️ แก้ไข: "ลบขอนนี้" (ฉบับสมบูรณ์) ‼️‼️)
async function deleteCurrentShoe() {
    const currentShoeId = await getCurrentShoeId();
    if (currentShoeId <= 1) throw new Error("ไม่สามารถลบขอนไพ่เริ่มต้น (Genesis Block) ได้");

    const shoeHistory = await getShoeHistory(currentShoeId);
    
    const tx = DB.transaction(['game_history', 'global_stats', 'expert_performance', 'shoe_meta'], 'readwrite');
    const store_game = tx.objectStore('game_history');
    
    for (const hand of shoeHistory) {
        await reverseGlobalStats(hand);
        await reverseExpertPerformance(hand);
        store_game.delete(hand.id);
    }
    
    tx.objectStore('shoe_meta').delete(currentShoeId);
    
    return new Promise((resolve, reject) => {
        tx.oncomplete = () => {
            console.log(`WORKER: ลบขอนไพ่ #${currentShoeId} ( ${shoeHistory.length} ตา) สำเร็จ`);
            // (เมื่อลบเสร็จ ให้ "คำนวณ" น้ำหนักใหม่)
            calculateExpertWeights().then(resolve);
        };
        tx.onerror = (e) => {
            console.error("WORKER: ลบขอนไพ่ล้มเหลว", e.target.error);
            reject(e.target.error);
        };
    });
}


// ========== 5. CORE LOGIC: AI ANALYSIS (การวิเคราะห์) ==========

let lastExpertVotes = {};

async function runAnalysis(lastHandId) {
    
    const currentShoeId = await getCurrentShoeId();
    const [globalStats, shoeHistory, expertPerformance] = await Promise.all([
        getGlobalStats(),
        getShoeHistory(currentShoeId),
        getExpertPerformance() // (ดึง "Winrate" ที่คำนวณไว้แล้ว)
    ]);
    
    const shoeStats = calculateShoeStats(shoeHistory);
    
    const votes = {};
    votes.main = expertMainPatterns(shoeHistory);
    votes.derived = expertDerivedRoads(shoeHistory);
    votes.rules = expertCardRules(shoeHistory);
    votes.stats = expertStats(shoeHistory); // (‼️‼️ อัปเกรด: ส่ง "ประวัติ" (h) ไม่ใช่ "สถิติ" (s) ‼️‼️)
    votes.special = expertSpecial(shoeHistory); // (‼️‼️ อัปเกรด: ฉลาดขึ้น ‼️‼️)
    votes.simA = expertSimulator(shoeStats, globalStats, 'stats');
    votes.simB = expertSimulator(shoeStats, globalStats, 'pattern');
    votes.simC = expertSimulator(shoeStats, globalStats, 'chaos');
    votes.miner = expertMiner(shoeHistory, globalStats);

    // (เรา "ไม่" (do not) ใช้ exploration หรือ weighting อีกต่อไป)
    // (เพราะ Meta-mind จะทำหน้าที่นี้ใน getFinalSignal)
    
    const signal = getFinalSignal(votes, expertPerformance, CONFIG.riskThreshold);
    
    lastExpertVotes = votes; // (บันทึกโหวต "ดิบ" (Raw) เพื่อใช้เรียนรู้)

    return {
        history: { shoe: shoeHistory },
        stats: {
            shoe: shoeStats,
            global: globalStats,
            storageSizeMB: globalStats.storageSizeMB || 0.1
        },
        signal: signal,
        expertPerformance: expertPerformance // (ส่ง Winrate ไปให้ UI แสดง)
    };
}

// ========== 6. AI EXPERTS (ผู้เชี่ยวชาญ 9 ตัว) ==========
// (‼️‼️ อัปเกรด: "ลับคม" ‼️‼️)

function expertMainPatterns(h) {
    if (h.length < 2) return 'WAIT';
    const last = h[h.length-1].result[0];
    const prev = h[h.length-2].result[0];

    if (last === prev && last !== 'T') return last; 
    
    if (h.length < 4) return 'WAIT';
    const prev2 = h[h.length-3].result[0];
    const prev3 = h[h.length-4].result[0];

    if (last === prev2 && prev === prev3 && last !== prev && last !== 'T' && prev !== 'T') {
        return (last === 'P' ? 'B' : 'P'); // (B -> P)
    }
    
    return 'WAIT';
}
function expertDerivedRoads(h) { return 'WAIT'; } // (ยังไม่ทำ)
function expertCardRules(h) { if (h.length < 1) return 'WAIT'; const r = h[h.length-1].result; if(r==='P3' || r==='B3') return 'B'; if(r==='P2' || r==='B2') return 'P'; return 'WAIT'; } 

// (‼️‼️ อัปเกรด: "โมเมนตัม 10 ตาล่าสุด" ‼️‼️)
function expertStats(h) {
    if (h.length < 10) return 'WAIT'; // (รอข้อมูล 10 ตา)
    const last10 = h.slice(-10);
    let pCount = 0;
    let bCount = 0;
    
    last10.forEach(hand => {
        if (hand.result[0] === 'P') pCount++;
        else if (hand.result[0] === 'B') bCount++;
    });
    
    if (pCount > bCount && pCount >= 7) return 'P'; // (โมเมนตัม P ชัดเจน)
    if (bCount > pCount && bCount >= 7) return 'B'; // (โมเมนตัม B ชัดเจน)
    
    return 'WAIT';
}

// (‼️‼️ อัปเกรด: "มือโปรไม่เล่นตอน TIE" ‼️‼️)
function expertSpecial(h) {
    if (h.length < 1) return 'WAIT';
    if(h[h.length-1].result === 'T') return 'WAIT'; // (ตาที่แล้ว TIE -> ให้รอดู)
    return 'WAIT';
}

function expertSimulator(s, g, type) { if (s.totalHands < 10) return 'WAIT'; if (type === 'stats') return s.P > s.B ? 'P' : 'B'; return 'WAIT'; } 
function expertSimulator(s, g, type) { return 'WAIT'; } 
function expertSimulator(s, g, type) { return 'WAIT'; } 
function expertMiner(h, g) { return 'WAIT'; } 

// ========== 7. AI VOTING & TRIGGERS ==========

// (‼️‼️ อัปเกรด: "META-MIND" ‼️‼️)
function getFinalSignal(votes, performance, riskThreshold) {
    
    // ---------------------------------------------
    // (โหมด 1: ปิด Meta-mind (ระบบนับคะแนน 1-9))
    // ---------------------------------------------
    if (!CONFIG.USE_META_MIND) {
        const voteCounts = { P: 0, B: 0, T: 0, WAIT: 0 };
        const voteKeys = Object.keys(votes);
        const totalExperts = voteKeys.length; // (9)
        
        voteKeys.forEach(key => { voteCounts[votes[key]]++; });

        let finalPrediction = 'WAIT';
        let maxVotes = 0;
        
        if (voteCounts.P > maxVotes) { maxVotes = voteCounts.P; finalPrediction = 'P'; }
        if (voteCounts.B > maxVotes) { maxVotes = voteCounts.B; finalPrediction = 'B'; }
        // (เราไม่สน TIE)
        
        if (maxVotes < riskThreshold || (voteCounts.P === voteCounts.B && maxVotes > 0)) {
            finalPrediction = 'WAIT';
        }
        
        let condition = `${maxVotes}/${totalExperts} เสียง (ต้องการ ${riskThreshold})`;
        if (finalPrediction === 'WAIT') {
            condition = `รอ ${riskThreshold}/${totalExperts} เสียง`;
        }

        return {
            finalPrediction: finalPrediction,
            confidence: Math.round((maxVotes / totalExperts) * 100),
            condition: condition,
            expertVotes: votes
        };
    }

    // ---------------------------------------------
    // (โหมด 2: เปิด Meta-mind (ระบบถ่วงน้ำหนัก))
    // ---------------------------------------------
    const scores = { P: 0, B: 0, T: 0, WAIT: 0 };
    const voteKeys = Object.keys(votes);
    
    voteKeys.forEach(key => {
        const vote = votes[key]; // (P, B, T, WAIT)
        const weight = EXPERT_WEIGHTS[key] || CONFIG.META_MIND_DEFAULT_WEIGHT; // (เช่น 0.62 หรือ 0.50)
        scores[vote] += weight;
    });

    let finalPrediction = 'WAIT';
    let maxScore = 0;
    
    if (scores.P > maxScore) { maxScore = scores.P; finalPrediction = 'P'; }
    if (scores.B > maxScore) { maxScore = scores.B; finalPrediction = 'B'; }
    
    // (คำนวณ "คะแนนขั้นต่ำ" (Threshold) จาก Slider (1-9))
    // (นี่คือ "สัญชาตญาณ" ที่แปลง Slider -> คะแนน)
    const normalizedThreshold = riskThreshold * CONFIG.META_MIND_NORMALIZATION_FACTOR; 
    
    if (maxScore < normalizedThreshold || (scores.P === scores.B && maxScore > 0)) {
        finalPrediction = 'WAIT';
    }

    let condition = `คะแนน ${maxScore.toFixed(2)} (ต้องการ ${normalizedThreshold.toFixed(2)})`;
    if (finalPrediction === 'WAIT') {
         condition = `รอคะแนน ${normalizedThreshold.toFixed(2)}`;
    }
    
    return {
        finalPrediction: finalPrediction,
        // (ความมั่นใจ = คะแนนที่ได้ / 9 (คะแนนเต็มที่เป็นไปได้สูงสุด))
        confidence: Math.round((maxScore / 9) * 100), 
        condition: condition,
        expertVotes: votes
    };
}

// ========== 8. HELPER FUNCTIONS (ตัวช่วย) ==========

async function checkGenesisBlock() {
    const stats = await safeGet('global_stats', 'TOTAL_HANDS');
    return !stats; 
}

async function runGenesisBlock() {
    const currentShoeId = 1;
    await safeAdd('shoe_meta', { startTime: Date.now() });

    const stats = {};
    
    for (const result of GENESIS_BLOCK_DATA) {
        const handResult = result === 'T' ? 'T' : (result + '_UNKNOWN');
        const handData = { result: handResult, shoe: currentShoeId, timestamp: Date.now(), lastSignal: {}, signalWin: null };
        
        await safeAdd('game_history', handData); 
        
        const mainResult = handResult[0];
        const keys = ['TOTAL_HANDS', mainResult, handResult];
        keys.forEach(key => {
            stats[key] = (stats[key] || 0) + 1;
        });
    }
    
    for (const key in stats) {
        await safeWrite('global_stats', { key: key, value: stats[key] });
    }

    postMessage({ command: 'RETRAIN_PROGRESS', progress: 100, message: "โหลด 'บล็อกกำเนิด' สำเร็จ!" });
}

// (ฟังก์ชันอ่าน/เขียน ตารางสรุป)
async function getGlobalStats() {
    const allStats = await safeGetAll('global_stats');
    return allStats.reduce((acc, item) => {
        acc[item.key] = item.value;
        return acc;
    }, {});
}
async function updateGlobalStats(handData) {
    const result = handData.result;
    const mainResult = result[0];
    const keys = ['TOTAL_HANDS', mainResult, result];
    
    if (handData.signalWin === true) {
        keys.push('HUNTER_WINS');
    } else if (handData.signalWin === false) {
        keys.push('HUNTER_LOSSES');
    }
    
    // (ใช้ Transaction เดียวเพื่อความเร็ว)
    const tx = DB.transaction('global_stats', 'readwrite');
    const store = tx.objectStore('global_stats');
    
    for (const key of keys) {
        const data = (await store.get(key)) || { key: key, value: 0 };
        data.value++;
        store.put(data);
    }
}
async function reverseGlobalStats(handData) {
    const result = handData.result;
    const mainResult = result[0];
    const keys = ['TOTAL_HANDS', mainResult, result];
    
    if (handData.signalWin === true) {
        keys.push('HUNTER_WINS');
    } else if (handData.signalWin === false) {
        keys.push('HUNTER_LOSSES');
    }
    
    const tx = DB.transaction('global_stats', 'readwrite');
    const store = tx.objectStore('global_stats');

    for (const key of keys) {
        const data = await store.get(key);
        if (data && data.value > 0) {
            data.value--;
            store.put(data);
        }
    }
}

// (ฟังก์ชันอ่าน/เขียน Winrate)
async function getExpertPerformance() {
    const allPerf = await safeGetAll('expert_performance');
    return allPerf.reduce((acc, item) => {
        acc[item.expertName] = item.stats;
        return acc;
    }, {});
}
async function updateExpertPerformance(handData) {
    const actualResult = handData.result[0];
    if (actualResult === 'T') return;
    
    const votes = handData.lastSignal; 
    if (!votes || Object.keys(votes).length === 0) return; 
    
    const tx = DB.transaction('expert_performance', 'readwrite');
    const store = tx.objectStore('expert_performance');

    for (const expertKey in votes) {
        const prediction = votes[expertKey];
        if (prediction === 'WAIT' || prediction === 'T') continue;
            
        const data = (await store.get(expertKey)) || { expertName: expertKey, stats: { wins: 0, losses: 0, total: 0 } };
        
        if (prediction === actualResult) data.stats.wins++;
        else data.stats.losses++;
        data.stats.total++;
        
        store.put(data);
    }
}
async function reverseExpertPerformance(handData) {
    const actualResult = handData.result[0];
    if (actualResult === 'T') return;
    
    const votes = handData.lastSignal;
    if (!votes || Object.keys(votes).length === 0) return; 
    
    const tx = DB.transaction('expert_performance', 'readwrite');
    const store = tx.objectStore('expert_performance');

    for (const expertKey in votes) {
        const prediction = votes[expertKey];
        if (prediction === 'WAIT' || prediction === 'T') continue;
            
        const data = await store.get(expertKey);
        if (data) {
            if (prediction === actualResult) {
                if (data.stats.wins > 0) data.stats.wins--;
            } else {
                if (data.stats.losses > 0) data.stats.losses--;
            }
            if (data.stats.total > 0) data.stats.total--;
            
            store.put(data);
        }
    }
}

// (‼️‼️ เพิ่ม: "สมองส่วนสัญชาตญาณ" ‼️‼️)
async function calculateExpertWeights() {
    const performance = await getExpertPerformance();
    const newWeights = {};
    
    const expertKeys = ['main', 'derived', 'rules', 'stats', 'special', 'simA', 'simB', 'simC', 'miner'];

    for (const key of expertKeys) {
        const perf = performance[key];
        
        // (ถ้าไม่มีข้อมูล หรือ ข้อมูลน้อยเกินไป (น้อยกว่า 20))
        if (!perf || perf.total < CONFIG.META_MIND_MIN_VOTES) {
            newWeights[key] = CONFIG.META_MIND_DEFAULT_WEIGHT; // (ให้ค่าน้ำหนัก "เริ่มต้น")
        } else {
            // (คำนวณ Winrate)
            const winrate = perf.wins / perf.total;
            newWeights[key] = winrate; // (เช่น 0.62)
        }
    }
    
    EXPERT_WEIGHTS = newWeights; // (บันทึก "สัญชาตญาณ" ใหม่)
    console.log("WORKER: 'Meta-mind' Weights Recalculated:", EXPERT_WEIGHTS);
}


// (Helper - คำนวณสถิติขอนนี้)
function calculateShoeStats(shoeHistory) {
    const stats = { P: 0, B: 0, T: 0, P2: 0, P3: 0, B2: 0, B3: 0, P_UNKNOWN: 0, B_UNKNOWN: 0, totalHands: 0, wins: 0, losses: 0, winrate: 0 };
    
    shoeHistory.forEach(h => {
        stats.totalHands++;
        if (h.result) { 
            stats[h.result]++; 
            if(h.result[0] === 'P') stats.P++;
            if(h.result[0] === 'B') stats.B++;
            if(h.result[0] === 'T') stats.T++;
        }
        
        if (h.signalWin === true) {
            stats.wins++;
        } else if (h.signalWin === false) {
            stats.losses++;
        }
    });
    
    const totalDecisions = stats.wins + stats.losses;
    if (totalDecisions > 0) {
        stats.winrate = Math.round((stats.wins / totalDecisions) * 100);
    }
    
    return stats;
}

// (Helper - ดึง ID ขอนไพ่ปัจจุบัน)
async function getCurrentShoeId() {
    const store = getStore('shoe_meta', 'readonly');
    return new Promise((resolve) => {
        const cursorReq = store.openCursor(null, 'prev');
        cursorReq.onsuccess = (e) => {
            const cursor = e.target.result;
            resolve(cursor ? cursor.value.id : 1);
        };
        cursorReq.onerror = () => resolve(1);
    });
}
// (Helper - ดึงประวัติ "ขอนนี้")
async function getShoeHistory(shoeId) {
    const store = getStore('game_history', 'readonly');
    const index = store.index('shoe_index');
    return new Promise((resolve) => {
        const req = index.getAll(shoeId);
        req.onsuccess = (e) => resolve(e.target.result || []);
        req.onerror = () => resolve([]);
    });
}
// (Helper - ดึงประวัติทั้งหมด)
async function getAllHistory(filter = 'all') {
    if (filter === 'unknown') {
        const index = getStore('game_history', 'readonly').index('result_index');
        const pUnknown = new Promise(res => index.getAll('P_UNKNOWN').onsuccess = e => res(e.target.result || []));
        const bUnknown = new Promise(res => index.getAll('B_UNKNOWN').onsuccess = e => res(e.target.result || []));
        return (await pUnknown).concat(await bUnknown);
    }
    return safeGetAll('game_history');
}
// (Helper - นับจำนวนตา (สำหรับ Memory Restart))
async function getHandCount() {
    const stats = await safeGet('global_stats', 'TOTAL_HANDS');
    return stats ? stats.value : 0;
}


// ========== 9. BACKUP & MAINTENANCE ==========

// (สร้างไฟล์ CSV)
async function exportCSV() {
    const history = await getAllHistory();
    if (history.length === 0) throw new Error("ไม่มีประวัติให้ Export");
    
    const header = "id,timestamp,result,shoe";
    const rows = history.map(h => `${h.id},${h.timestamp},${h.result},${h.shoe || 0}`);
    return [header, ...rows].join('\n');
}

// (ฝึกสมองใหม่จาก CSV - แก้แผล "Re-train Crash")
async function retrainFromCSV(csvString) {
    await clearAllMemory(false); 
    
    const lines = csvString.trim().split(/\r?\n/);
    if (lines.length <= 1) throw new Error("ไฟล์ CSV ว่างเปล่า");
    
    const headerLine = lines.shift();
    const headers = headerLine.split(',');
    
    const totalLines = lines.length;
    const chunkSize = 500; 
    
    let currentShoe = 0;

    for (let i = 0; i < totalLines; i += chunkSize) {
        const chunk = lines.slice(i, i + chunkSize);
        
        for (const line of chunk) {
            const cols = line.split(',');
            const hand = {};
            headers.forEach((h, index) => {
                if (h === 'id' || h === 'timestamp' || h === 'shoe') {
                    hand[h] = parseInt(cols[index], 10) || 0;
                } else {
                    hand[h] = cols[index] || 'T';
                }
            });
            
            delete hand.id; 
            
            if (hand.shoe > currentShoe) {
                await safeAdd('shoe_meta', { startTime: hand.timestamp });
                currentShoe = hand.shoe;
            }
            
            hand.signalWin = null;
            hand.lastSignal = {};
            
            await safeAdd('game_history', hand);
            await updateGlobalStats(hand);
        }
        
        const progress = Math.round(((i + chunk.length) / totalLines) * 100);
        postMessage({
            command: 'RETRAIN_PROGRESS',
            progress: progress,
            message: `กำลังประมวลผล ${i + chunk.length} / ${totalLines} ตา...`
        });
    }
    
    return "Retrain complete";
}

// (ล้างสมอง)
async function clearAllMemory(sendPostMessage = true) {
    if (!DB) await initDB();
    
    const storeNames = ['game_history', 'global_stats', 'expert_performance', 'shoe_meta'];
    const tx = DB.transaction(storeNames, 'readwrite');
    
    await Promise.all([
        tx.objectStore('game_history').clear(),
        tx.objectStore('global_stats').clear(),
        tx.objectStore('expert_performance').clear(),
        tx.objectStore('shoe_meta').clear()
    ]);
    
    return "Memory cleared";
}

// (ตรวจสุขภาพ - BIST)
async function runBIST() {
    const stats = await getGlobalStats();
    if (!stats.TOTAL_HANDS || stats.TOTAL_HANDS < 0) {
        return { passed: false, message: "ข้อมูล 'ตารางสรุป' (Global Stats) เสียหาย! (TOTAL_HANDS ผิดพลาด)" };
    }
    const history = await getAllHistory();
    if (stats.TOTAL_HANDS != history.length) {
         return { passed: false, message: `ข้อมูล "ไม่ตรงกัน"! (ตารางสรุป: ${stats.TOTAL_HANDS} / ประวัติจริง: ${history.length})` };
    }
    return { passed: true, message: "ระบบสมบูรณ์ 100% (ข้อมูลตรงกัน)" };
}

// (แก้แผล "Memory Leak")
async function checkMemoryRestart() {
    if (CONFIG.MEMORY_RESTART_INTERVAL === 0) return; 
    
    const count = await getHandCount();
    if (count > 0 && count % CONFIG.MEMORY_RESTART_INTERVAL === 0) {
        console.log(`WORKER: Reached ${count} hands. Restarting worker to clear memory...`);
        postMessage({ command: 'FATAL_ERROR_FROM_WORKER', message: `ระบบรีสตาร์ทอัตโนมัติ (เพื่อล้างหน่วยความจำ)... กรุณารอสักครู่` });
        self.close();
    }
}

// (‼️‼️ แก้ไข: "สรุปประวัติขอนไพ่" (ฉบับสมบูรณ์) ‼️‼️)
async function getShoeSummary() {
    const allShoesMeta = await safeGetAll('shoe_meta');
    
    const recentShoesMeta = allShoesMeta.slice(-5).reverse();
    const summary = [];
    
    const currentShoeId = await getCurrentShoeId();
    
    for (const meta of recentShoesMeta) {
        const shoeHistory = await getShoeHistory(meta.id);
        const stats = calculateShoeStats(shoeHistory);
        summary.push({
            id: meta.id,
            isCurrent: meta.id === currentShoeId,
            P: stats.P,
            B: stats.B,
            T: stats.T,
            totalHands: stats.totalHands
        });
    }
    return summary;
}


// ========== 10. EVENT LISTENER (ตัวรับคำสั่งจากหน้าจอ) ==========

self.onmessage = async (e) => {
    const data = e.data;
    
    try {
        const process = async (command) => {
            switch (command) {
                case 'INIT':
                    await initDB();
                    CONFIG = { ...AI_CONFIG, ...data.config }; 
                    return { command: 'INIT_COMPLETE' };
                
                case 'HEARTBEAT_PING':
                    return { command: 'HEARTBEAT_PONG' };
                    
                case 'LOAD_LAST_STATE':
                    return { command: 'LAST_STATE_LOADED', state: await loadLastState() };
                
                case 'ADD_HAND':
                    return { command: 'ANALYSIS_COMPLETE', state: await addHand(data.result, lastExpertVotes) };
                
                case 'UNDO_LAST_HAND':
                    return { command: 'ANALYSIS_COMPLETE', state: await undoLastHand() };
                    
                case 'NEW_SHOE':
                    return { command: 'ANALYSIS_COMPLETE', state: await newShoe() };
                    
                case 'GET_HISTORY':
                    return { command: 'HISTORY_LOADED', history: await getAllHistory(data.filter), filter: data.filter };
                    
                case 'EDIT_HISTORY':
                    return { command: 'ANALYSIS_COMPLETE', state: await editHistory(data.handId, data.newResult) };
                    
                case 'UPDATE_CONFIG':
                    CONFIG = { ...AI_CONFIG, ...CONFIG, ...data.config };
                    // (‼️‼️ เพิ่ม: "คำนวณ" น้ำหนักใหม่ เมื่อเปิด/ปิด ‼️‼️)
                    await calculateExpertWeights(); 
                    return { command: 'CONFIG_UPDATED' }; // (ไม่จำเป็นต้องส่งอะไรกลับ)
                    
                case 'EXPORT_CSV':
                    return { command: 'EXPORT_DATA', csvString: await exportCSV() };
                    
                case 'RETRAIN_FROM_CSV':
                    await retrainFromCSV(data.csvString);
                    return { command: 'RETRAIN_COMPLETE' };
                    
                case 'CLEAR_ALL_MEMORY':
                    await clearAllMemory();
                    return { command: 'MEMORY_CLEARED' };
                    
                case 'RUN_BIST':
                    return { command: 'BIST_RESULT', ...await runBIST() };
                
                case 'DELETE_CURRENT_SHOE':
                    await deleteCurrentShoe();
                    return { command: 'ANALYSIS_COMPLETE', state: await loadLastState() };
                    
                case 'GET_SHOE_SUMMARY':
                    return { command: 'SHOE_SUMMARY_LOADED', summary: await getShoeSummary() };
                
                default:
                    return { command: 'ACTION_FAILED', message: 'Unknown command' };
            }
        };
        
        const response = await process(data.command);
        if (response) postMessage(response);

    } catch (error) {
        console.error(`WORKER: Error processing command ${data.command}:`, error);
        postMessage({ 
            command: 'ACTION_FAILED', 
            message: error.message || error.toString() 
        });
    }
};

console.log("WORKER: 'สมอง AI' (worker.js v12 - Meta-mind) โหลดแล้ว พร้อมรับคำสั่ง...");
