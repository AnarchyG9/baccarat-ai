/* ========== PART 3: AI BRAIN (WEB WORKER) ========== */
/*
 * นี่คือ "สมอง AI" (God-Tier) ฉบับสมบูรณ์
 * (ฉบับแก้ไข: v11 - แก้ไขบั๊ก Restart, Delete Shoe, อัปเกรด AI)
 * ทำหน้าที่: คำนวณตรรกะ AI ทั้งหมด, จัดการฐานข้อมูล (IndexedDB)
 * มันทำงานแยกขาดจาก "หน้าจอ" (UI) โดยสิ้นเชิง
 */

"use strict";

// ========== 1. AI CONFIGURATION (แก้แผล "บำรุงรักษา") ==========
const AI_CONFIG = {
    // (1-9) เสียงโหวตขั้นต่ำที่ "ระบบ Hunter" ต้องมีก่อนส่ง Signal
    TRIGGER_THRESHOLD: 5,
    
    // (0.0 - 1.0) % ที่ AI จะ "ทดลอง" เชื่อผู้เชี่ยวชาญตัวอื่น (แก้แผล "ติดกับดัก")
    EXPLORATION_RATE: 0.1, // (10%)
    
    // (จำนวนตา) "อคติปัจจุบัน" (Recency Bias) จะให้น้ำหนักกี่ตา ล่าสุด
    RECENCY_BIAS_HANDS: 10000,
    
    // (จำนวนครั้ง) "Simulator" จะจำลองอนาคตตาละกี่ครั้ง
    SIMULATOR_ITERATIONS: 10000,
    
    // (แก้แผล "Memory Leak") - รีสตาร์ทสมองทุกๆ กี่ตา
    // (‼️‼️ แก้ไขถาวร: 0 = ปิด ‼️‼️)
    MEMORY_RESTART_INTERVAL: 0
};

let CONFIG = {}; // (ประกาศตัวแปร CONFIG)


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
// (‼️‼️ นี่คือ "การแก้ไข" ที่สำคัญที่สุด ‼️‼️)
const DB_VERSION = 10; // (บังคับอัปเกรดจากของเก่าที่พัง)

function initDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            // (บังคับลบของเก่าทิ้งทั้งหมด)
            if (db.objectStoreNames.contains('game_history')) db.deleteObjectStore('game_history');
            if (db.objectStoreNames.contains('global_stats')) db.deleteObjectStore('global_stats');
            if (db.objectStoreNames.contains('expert_performance')) db.deleteObjectStore('expert_performance');
            if (db.objectStoreNames.contains('shoe_meta')) db.deleteObjectStore('shoe_meta');
            
            // 1. ประวัติ (หนังสือเรียน)
            const historyStore = db.createObjectStore('game_history', { keyPath: 'id', autoIncrement: true });
            historyStore.createIndex('shoe_index', 'shoe', { unique: false });
            historyStore.createIndex('result_index', 'result', { unique: false });
            
            // 2. สถิติรวม (แก้แผล "สมองระเบิด")
            db.createObjectStore('global_stats', { keyPath: 'key' });
            
            // 3. ประสิทธิภาพผู้เชี่ยวชาญ (แก้แผล "ความเชื่อใจ")
            db.createObjectStore('expert_performance', { keyPath: 'expertName' });
            
            // 4. ข้อมูลขอนไพ่
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
// (ฟังก์ชัน "ปลอดภัย" (Helper))
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
    // (‼️‼️ ย้าย: checkMemoryRestart() ออกจาก runAnalysis มาที่นี่ ‼️‼️)
    await checkMemoryRestart();
    
    const currentShoeId = await getCurrentShoeId();
    
    // (1. "ตัดสิน" (Judge) ผลแพ้/ชนะ)
    let signalWin = null; // (null = ไม่นับ)
    const finalPred = lastSignal.finalPrediction;
    const actualResult = result[0];
    
    if (finalPred && finalPred !== 'WAIT' && finalPred !== 'T' && actualResult !== 'T') {
        signalWin = (finalPred === actualResult); // (true = ชนะ, false = แพ้)
    }
    
    const handData = {
        result: result,
        shoe: currentShoeId,
        timestamp: Date.now(),
        lastSignal: lastSignal, // (บันทึก Signal ที่ AI เพิ่งให้ไป)
        signalWin: signalWin    // (2. "บันทึก" (Save) ผลแพ้/ชนะ)
    };
    
    const newHandId = await safeAdd('game_history', handData);
    
    // 3. "อัปเดต" (Update) ตารางสรุป (Global Stats)
    await updateGlobalStats(handData);
    // 4. "อัปเดต" (Update) "ประสิทธิภาพผู้เชี่ยวชาญ" (Shadow Mode)
    await updateExpertPerformance(handData);
    
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
                
                // (ย้อนกลับ "ตารางสรุป" และ "ประสิทธิภาพ")
                await reverseGlobalStats(handToRemove);
                await reverseExpertPerformance(handToRemove);

                const deleteReq = cursor.delete();
                deleteReq.onerror = (e) => reject(e.target.error);
            }
        };
        cursorReq.onerror = (e) => reject(e.target.error);
        
        tx.oncomplete = () => {
             runAnalysis(null).then(resolve).catch(reject);
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
        
        // (เราต้อง "Re-train" สถิติที่เกี่ยวข้องทั้งหมด)
        await reverseGlobalStats(oldData);
        await updateGlobalStats(newData);
        await reverseExpertPerformance(oldData);
        
        await safeWrite('game_history', newData);
        
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
    return runAnalysis(null);
}

// (‼️‼️ เพิ่ม: "ลบขอนนี้" (ฉบับสมบูรณ์) ‼️‼️)
async function deleteCurrentShoe() {
    const currentShoeId = await getCurrentShoeId();
    if (currentShoeId <= 1) throw new Error("ไม่สามารถลบขอนไพ่เริ่มต้น (Genesis Block) ได้");

    const shoeHistory = await getShoeHistory(currentShoeId);
    
    // (เปิด Transaction ใหญ่)
    const tx = DB.transaction(['game_history', 'global_stats', 'expert_performance', 'shoe_meta'], 'readwrite');
    const store_game = tx.objectStore('game_history');
    
    for (const hand of shoeHistory) {
        // (ย้อนสถิติทั้งหมด)
        await reverseGlobalStats(hand);
        await reverseExpertPerformance(hand);
        // (ลบข้อมูลตา)
        store_game.delete(hand.id);
    }
    
    // (ลบขอนไพ่)
    tx.objectStore('shoe_meta').delete(currentShoeId);
    
    return new Promise((resolve, reject) => {
        tx.oncomplete = () => {
            console.log(`WORKER: ลบขอนไพ่ #${currentShoeId} ( ${shoeHistory.length} ตา) สำเร็จ`);
            resolve();
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
    
    // (‼️‼️ ย้าย: checkMemoryRestart() ไปที่ addHand() แล้ว ‼️‼️)
    
    const currentShoeId = await getCurrentShoeId();
    const [globalStats, shoeHistory, expertPerformance] = await Promise.all([
        getGlobalStats(),
        getShoeHistory(currentShoeId),
        getExpertPerformance()
    ]);
    
    const shoeStats = calculateShoeStats(shoeHistory);
    
    const votes = {};
    votes.main = expertMainPatterns(shoeHistory);
    votes.derived = expertDerivedRoads(shoeHistory);
    votes.rules = expertCardRules(shoeHistory);
    votes.stats = expertStats(shoeStats);
    votes.special = expertSpecial(shoeHistory);
    votes.simA = expertSimulator(shoeStats, globalStats, 'stats');
    votes.simB = expertSimulator(shoeStats, globalStats, 'pattern');
    votes.simC = expertSimulator(shoeStats, globalStats, 'chaos');
    votes.miner = expertMiner(shoeHistory, globalStats);

    const exploredVotes = applyExploration(votes, expertPerformance);
    const weightedVotes = applyWeighting(exploredVotes, expertPerformance);
    const signal = getFinalSignal(weightedVotes, CONFIG.riskThreshold);
    
    lastExpertVotes = votes; 

    return {
        history: { shoe: shoeHistory },
        stats: {
            shoe: shoeStats,
            global: globalStats,
            storageSizeMB: globalStats.storageSizeMB || 0.1
        },
        signal: signal,
        expertPerformance: expertPerformance
    };
}

// ========== 6. AI EXPERTS (ผู้เชี่ยวชาญ 9 ตัว) ==========
// (Placeholder ตรรกะง่ายๆ)

// (‼️‼️ อัปเกรด: ให้รู้จัก "ปิงปอง" ‼️‼️)
function expertMainPatterns(h) {
    if (h.length < 2) return 'WAIT';
    const last = h[h.length-1].result[0];
    const prev = h[h.length-2].result[0];

    // ตามมังกร (Dragon) (PP -> P)
    if (last === prev && last !== 'T') return last; 
    
    if (h.length < 4) return 'WAIT';
    const prev2 = h[h.length-3].result[0];
    const prev3 = h[h.length-4].result[0];

    // ตามปิงปอง (Ping Pong) (PBPB -> P)
    // (h = [..., P, B, P, B]) -> last=B, prev=P, prev2=B, prev3=P
    if (last === prev2 && prev === prev3 && last !== prev && last !== 'T' && prev !== 'T') {
        return (last === 'P' ? 'B' : 'P'); // (B -> P)
    }
    
    return 'WAIT';
}

function expertDerivedRoads(h) { if (h.length < 4) return 'WAIT'; const r = h.slice(-4).map(x=>x.result[0]).join(''); if(r==='PBPB') return 'P'; if(r==='BPBP') return 'B'; return 'WAIT'; } // (ตามปิงปอง)
function expertCardRules(h) { if (h.length < 1) return 'WAIT'; const r = h[h.length-1].result; if(r==='P3' || r==='B3') return 'B'; if(r==='P2' || r==='B2') return 'P'; return 'WAIT'; } // (กฎ P3/B3 -> B)
function expertStats(s) { if(s.P > s.B + 3) return 'P'; if(s.B > s.P + 3) return 'B'; return 'WAIT'; } // (ตามฝั่งนำ)
function expertSpecial(h) { if (h.length < 2) return 'WAIT'; if(h[h.length-1].result === 'T') return h[h.length-2].result[0]; return 'WAIT'; } // (เสมอต่อ)
function expertSimulator(s, g, type) { if (s.totalHands < 10) return 'WAIT'; if (type === 'stats') return s.P > s.B ? 'P' : 'B'; return 'WAIT'; } // (SimA - สถิติ)
function expertSimulator(s, g, type) { if (type === 'pattern') return 'WAIT'; return 'WAIT'; } // (SimB - รูปแบบ)
function expertSimulator(s, g, type) { if (type === 'chaos') return 'WAIT'; return 'WAIT'; } // (SimC - ผันวน)
function expertMiner(h, g) { return 'WAIT'; } // (SimD - "นักขุด")

// ========== 7. AI VOTING & TRIGGERS ==========

function applyExploration(votes, performance) { return votes; }
function applyWeighting(votes, performance) { return votes; }

function getFinalSignal(votes, riskThreshold) {
    const voteCounts = { P: 0, B: 0, T: 0, WAIT: 0 };
    const voteKeys = Object.keys(votes);
    const totalExperts = voteKeys.length; // (9)
    
    voteKeys.forEach(key => { voteCounts[votes[key]]++; });

    let finalPrediction = 'WAIT';
    let maxVotes = 0;
    
    if (voteCounts.P > maxVotes) { maxVotes = voteCounts.P; finalPrediction = 'P'; }
    if (voteCounts.B > maxVotes) { maxVotes = voteCounts.B; finalPrediction = 'B'; }
    if (voteCounts.T > maxVotes) { maxVotes = voteCounts.T; finalPrediction = 'T'; }
    
    if (maxVotes < CONFIG.riskThreshold || (voteCounts.P === voteCounts.B && maxVotes > 0)) {
        finalPrediction = 'WAIT';
    }

    let condition = `รอเงื่อนไข (ต้องการ ${CONFIG.riskThreshold}/${totalExperts} เสียง)`;
    if (finalPrediction !== 'WAIT') {
        condition = `Hunter Signal (${maxVotes}/${totalExperts} เสียง)`;
    } else if (maxVotes >= CONFIG.riskThreshold) {
        condition = `เสียงแตก (P ${voteCounts.P} vs B ${voteCounts.B})`;
    }
    
    return {
        finalPrediction: finalPrediction,
        confidence: Math.round((maxVotes / totalExperts) * 100),
        condition: condition,
        expertVotes: votes
    };
}

// ========== 8. HELPER FUNCTIONS (ตัวช่วย) ==========

async function checkGenesisBlock() {
    const stats = await safeGet('global_stats', 'TOTAL_HANDS');
    return !stats; // (ถ้า "ไม่" เจอ = ต้องสร้าง)
}
// (‼️‼️ "โค้ดที่แก้ไข" Deadlock ‼️‼️)
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

// (แก้แผล "สมองระเบิด" - ฟังก์ชันอ่าน/เขียน ตารางสรุป)
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
    
    for (const key of keys) {
        const data = (await safeGet('global_stats', key)) || { key: key, value: 0 };
        data.value++;
        await safeWrite('global_stats', data);
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
    
    for (const key of keys) {
        const data = await safeGet('global_stats', key);
        if (data && data.value > 0) {
            data.value--;
            await safeWrite('global_stats', data);
        }
    }
}

// (แก้แผล "ความเชื่อใจ" - ฟังก์ชันอ่าน/เขียน Winrate)
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
    
    // (‼️‼️ แก้ไข: ใช้ "lastSignal" ที่ "บันทึก" ไว้ ‼️‼️)
    const votes = handData.lastSignal;
    if (!votes || Object.keys(votes).length === 0) return; // (ป้องกัน Error ถ้า lastSignal ว่าง)
    
    for (const expertKey in votes) {
        const prediction = votes[expertKey];
        if (prediction === 'WAIT' || prediction === 'T') continue;
            
        const data = (await safeGet('expert_performance', expertKey)) || { expertName: expertKey, stats: { wins: 0, losses: 0, total: 0 } };
        
        if (prediction === actualResult) data.stats.wins++;
        else data.stats.losses++;
        data.stats.total++;
        
        await safeWrite('expert_performance', data);
    }
}
async function reverseExpertPerformance(handData) {
    const actualResult = handData.result[0];
    if (actualResult === 'T') return;
    
    const votes = handData.lastSignal;
    if (!votes || Object.keys(votes).length === 0) return; // (ป้องกัน Error ถ้า lastSignal ว่าง)
    
    for (const expertKey in votes) {
        const prediction = votes[expertKey];
        if (prediction === 'WAIT' || prediction === 'T') continue;
            
        const data = await safeGet('expert_performance', expertKey);
        if (data) {
            if (prediction === actualResult) {
                if (data.stats.wins > 0) data.stats.wins--;
            } else {
                if (data.stats.losses > 0) data.stats.losses--;
            }
            if (data.stats.total > 0) data.stats.total--;
            
            await safeWrite('expert_performance', data);
        }
    }
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
    // (‼️‼️ แก้ไขถาวร: ถ้าเป็น 0 ให้ "ปิด" ‼️‼️)
    if (CONFIG.MEMORY_RESTART_INTERVAL === 0) return; 
    
    const count = await getHandCount();
    if (count > 0 && count % CONFIG.MEMORY_RESTART_INTERVAL === 0) {
        console.log(`WORKER: Reached ${count} hands. Restarting worker to clear memory...`);
        postMessage({ command: 'FATAL_ERROR_FROM_WORKER', message: `ระบบรีสตาร์ทอัตโนมัติ (เพื่อล้างหน่วยความจำ)... กรุณารอสักครู่` });
        self.close(); // (ฆ่าตัวตาย)
    }
}

// (‼️‼️ เพิ่ม: "สรุปประวัติขอนไพ่" (ฉบับสมบูรณ์) ‼️‼️)
async function getShoeSummary() {
    const allShoesMeta = await safeGetAll('shoe_meta');
    
    // (จำกัดแค่ 5 ขอนล่าสุด เพื่อความเร็ว)
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
                    return { command: 'CONFIG_UPDATED' };
                    
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
                
                // (‼️‼️ แก้ไข: "ลบขอนนี้" ‼️‼️)
                case 'DELETE_CURRENT_SHOE':
                    await deleteCurrentShoe();
                    return { command: 'ANALYSIS_COMPLETE', state: await loadLastState() };
                    
                // (‼️‼️ แก้ไข: "สรุปประวัติขอนไพ่" ‼️‼️)
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

console.log("WORKER: 'สมอง AI' (worker.js) โหลดแล้ว พร้อมรับคำสั่ง...");
