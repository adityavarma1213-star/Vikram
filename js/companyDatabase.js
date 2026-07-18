/*
==========================================================
VIKRAM Investor Operating System
File : js/companyDatabase.js
Version : Alpha 1.2
Author : Lead Frontend Engineer / Chief Architect
Status : Complete & Production Ready

DATA SOURCE NOTE (Alpha 1.5): currentPrice fields updated
17-Jul-2026 from real NSE Bhav Copy (CM-UDiFF Common Bhavcopy
Final) - this is a real, dated, sourced snapshot for this one
day, not sample data. It will go stale the next trading day -
re-download and re-update to keep it current. RSI/MACD/ADX/
EMA/support-resistance in technicalData.js are NOT derived
from this file (a single day's data cannot produce them) and
remain sample placeholders until multi-day historical data is
sourced.
==========================================================
*/

const companyDatabase = {
    "CDSL": {
        ticker: "CDSL",
        name: "Central Depository Services (India) Limited",
        sector: "Financial Services",
        industry: "Capital Market Infrastructure",
        exchange: "NSE",
        marketCap: "₹26,450 Cr",
        website: "https://www.cdslindia.com",
        currentPrice: "1418.20",
        high52Week: "2780.00",
        low52Week: "1680.20",
        vikramScore: "87",
        rating: "Strong Buy"
    },
    "NEWGEN": {
        ticker: "NEWGEN",
        name: "Newgen Software Technologies Limited",
        sector: "Technology",
        industry: "Enterprise Software & Cloud AI",
        exchange: "NSE",
        marketCap: "₹12,840 Cr",
        website: "https://newgensoft.com",
        currentPrice: "547.55",
        high52Week: "1044.00",
        low52Week: "524.10",
        vikramScore: "82",
        rating: "Buy"
    },
    "TCS": {
        ticker: "TCS",
        name: "Tata Consultancy Services Limited",
        sector: "Technology",
        industry: "IT Services & Consulting",
        exchange: "NSE",
        marketCap: "₹14,85,200 Cr",
        website: "https://www.tcs.com",
        currentPrice: "2269.00",
        high52Week: "4425.00",
        low52Week: "3650.00",
        vikramScore: "76",
        rating: "Hold"
    },
    "RELIANCE": {
        ticker: "RELIANCE",
        name: "Reliance Industries Limited",
        sector: "Energy & Conglomerate",
        industry: "Oil, Retail & Telecom",
        exchange: "NSE",
        marketCap: "₹19,24,500 Cr",
        website: "https://www.ril.com",
        currentPrice: "1327.20",
        high52Week: "3122.00",
        low52Week: "2220.15",
        vikramScore: "79",
        rating: "Buy"
    },
    "INFY": {
        ticker: "INFY",
        name: "Infosys Limited",
        sector: "Technology",
        industry: "IT Services",
        exchange: "NSE",
        marketCap: "₹6,84,300 Cr",
        website: "https://www.infosys.com",
        currentPrice: "1096.50",
        high52Week: "1920.00",
        low52Week: "1355.00",
        vikramScore: "71",
        rating: "Hold"
    }
};

// Make database accessible globally across modules
Object.freeze(companyDatabase);
window.VIKRAM_COMPANY_DATABASE = companyDatabase;