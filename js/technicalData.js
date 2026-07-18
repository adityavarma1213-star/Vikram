/*
==========================================================
VIKRAM Investor Operating System
File : js/technicalData.js
Version : Alpha 1.2
Author : Lead Frontend Engineer / Chief Architect
Status : Complete & Production Ready
==========================================================
*/

const technicalData = {
    "CDSL": {
        rsi: "68.40",
        rsiSignal: "Bullish",
        macd: "34.50",
        macdSignal: "Bullish Crossover",
        adx: "28.10",
        adxSignal: "Strong Trend",
        ema20: "2480.50",
        ema50: "2395.20",
        ema200: "2110.00",
        support: "2450.00",
        resistance: "2620.00",
        trend: "Strong Uptrend",
        volume: "1.73M",
        volumeSignal: "Above Average",
        obv: "+12.4M",
        obvSignal: "Accumulation",
        deliveryPct: "48.5%",
        deliverySignal: "High Delivery",
        high52Week: "2780.00",
        low52Week: "1680.20"
    },
    "NEWGEN": {
        rsi: "55.20",
        rsiSignal: "Neutral",
        macd: "12.10",
        macdSignal: "Neutral",
        adx: "22.40",
        adxSignal: "Moderate Trend",
        ema20: "895.00",
        ema50: "870.15",
        ema200: "785.40",
        support: "880.00",
        resistance: "950.00",
        trend: "Mild Uptrend",
        volume: "6.52M",
        volumeSignal: "Average",
        obv: "+4.1M",
        obvSignal: "Steady",
        deliveryPct: "35.2%",
        deliverySignal: "Normal",
        high52Week: "1044.00",
        low52Week: "524.10"
    },
    "TCS": {
        rsi: "42.15",
        rsiSignal: "Bearish",
        macd: "-8.40",
        macdSignal: "Bearish Crossover",
        adx: "19.50",
        adxSignal: "Weak Trend",
        ema20: "4180.00",
        ema50: "4210.00",
        ema200: "4050.00",
        support: "4080.00",
        resistance: "4250.00",
        trend: "Consolidation / Weak Downward",
        volume: "5.62M",
        volumeSignal: "Below Average",
        obv: "-2.8M",
        obvSignal: "Distribution",
        deliveryPct: "61.2%",
        deliverySignal: "Institutional Absorption",
        high52Week: "4425.00",
        low52Week: "3650.00"
    },
    "RELIANCE": {
        rsi: "59.80",
        rsiSignal: "Neutral-Bullish",
        macd: "18.25",
        macdSignal: "Bullish",
        adx: "24.60",
        adxSignal: "Moderate Trend",
        ema20: "2820.10",
        ema50: "2795.00",
        ema200: "2650.40",
        support: "2780.00",
        resistance: "2920.00",
        trend: "Steady Uptrend",
        volume: "18.30M",
        volumeSignal: "Average",
        obv: "+18.9M",
        obvSignal: "Accumulation",
        deliveryPct: "52.3%",
        deliverySignal: "Strong Delivery",
        high52Week: "3122.00",
        low52Week: "2220.15"
    },
    "INFY": {
        rsi: "38.50",
        rsiSignal: "Bearish",
        macd: "-22.10",
        macdSignal: "Bearish",
        adx: "31.20",
        adxSignal: "Strong Trend",
        ema20: "1690.00",
        ema50: "1725.00",
        ema200: "1680.00",
        support: "1620.00",
        resistance: "1710.00",
        trend: "Downtrend",
        volume: "12.55M",
        volumeSignal: "Above Average",
        obv: "-8.4M",
        obvSignal: "Distribution",
        deliveryPct: "58.7%",
        deliverySignal: "High Delivery",
        high52Week: "1920.00",
        low52Week: "1355.00"
    }
};

// Make technical dataset accessible globally across modules
Object.freeze(technicalData);
window.VIKRAM_TECHNICAL_DATA = technicalData;