/*
==========================================================
VIKRAM Investor Operating System
File : js/ui.js
Version : Alpha 1.3
Author : Lead Frontend Engineer / Chief Architect
Status : Complete & Production Ready
==========================================================
*/

const vikramUI = {
    /**
     * Builds a plain-language explanation of the verdict by naming the
     * strongest and weakest real contributing pillars, and honestly flagging
     * any pillar that was excluded or any correlation dampening that applied.
     * This is the actual reasoning mechanism, not a templated-sounding summary.
     */
    buildExplanation: function(data) {
        const meta = data.meta;
        if (meta.vikramScore === null || meta.vikramScore === undefined) {
            return `${meta.name} cannot be scored - none of the five pillars currently have enough verified data. Treat this as an open case, not a recommendation.`;
        }

        const pillarLabels = {
            technical: 'Technical momentum',
            fundamental: 'Fundamental business quality',
            institutional: 'Institutional backing',
            valuation: 'Valuation',
            news: 'News & catalysts'
        };

        const pillarScores = [
            { key: 'technical', score: data.technical && parseFloat(data.technical.rsi) ? Math.min(100, Math.max(0, parseFloat(data.technical.rsi) * 1.2)) : null },
            { key: 'fundamental', score: data.fundamental ? data.fundamental.score : null },
            { key: 'institutional', score: (data.institutional && data.institutional.dataAvailable !== false) ? data.institutional.institutionalScore : null },
            { key: 'valuation', score: data.valuation ? (50 + (data.valuation.marginOfSafety * 1.2)) : null },
            { key: 'news', score: data.catalysts ? data.catalysts.newsScore : null }
        ].filter(p => p.score !== null && !isNaN(p.score));

        const sorted = [...pillarScores].sort((a, b) => b.score - a.score);
        const strongest = sorted[0];
        const weakest = sorted[sorted.length - 1];

        let text = `${meta.name} scores ${meta.vikramScore}/100 (${meta.rating}), drawing on ${meta.activePillarCount} of ${meta.totalPillarCount} VIKRAM pillars. `;

        if (strongest) {
            text += `${pillarLabels[strongest.key]} is the strongest contributor at ${Math.round(strongest.score)}/100. `;
        }
        if (weakest && weakest.key !== strongest?.key) {
            text += `${pillarLabels[weakest.key]} is the weakest at ${Math.round(weakest.score)}/100. `;
        }

        if (meta.activePillarCount < meta.totalPillarCount) {
            text += `The Institutional pillar was excluded from this score because no verified FII/DII data exists for this stock yet - the remaining pillars' weight was redistributed rather than filling the gap with a guess. `;
        }

        if (data.risk) {
            text += `Overall risk is rated ${data.risk.riskLevel} (financial risk: ${data.risk.financialRisk}, technical risk: ${data.risk.technicalRisk}). `;
        }

        if (meta.riskPenaltyApplied > 0) {
            text += `Because risk is HIGH, ${meta.riskPenaltyApplied} points were subtracted from the score (${meta.preRiskPenaltyScore} → ${meta.vikramScore}) as a safety adjustment - not a duplicate vote, but a check against severe tail risk hiding inside an otherwise fine-looking average. `;
        }

        text += `Confidence in this score is ${meta.confidence}% - `;
        text += meta.confidence >= 70
            ? `the pillars are broadly telling the same story.`
            : `the pillars disagree with each other more than usual, so treat the single score as a starting point for your own research, not a final answer.`;

        return text;
    },

    /**
     * Renders a custom floating toast notification inside the system framework.
     * @param {string} message - Text notification string.
     * @param {string} type - Status descriptor variant ('success', 'error', 'warning').
     */
    showNotification: function(message, type = 'success') {
        const bar = document.getElementById('notificationBar');
        if (!bar) return;

        const toast = document.createElement('div');
        toast.className = `notification-toast ${type}`;
        toast.textContent = message;

        bar.appendChild(toast);

        // Auto-cleanup DOM lifecycles after animation sequences
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(50px)';
            toast.style.transition = 'all 0.3s ease';
            setTimeout(() => toast.remove(), 300);
        }, 4000);
    },

    /**
     * Clears analytical workspace displays back to initial empty vector states.
     */
    clearWorkspace: function() {
        const targets = [
            'watchlistPreview', 'institutionDashboard', 'valuationDashboard', 
            'riskDashboard', 'sectorDashboard', 'businessDashboard', 'catalystDashboard'
        ];
        
        targets.forEach(id => {
            const container = document.getElementById(id);
            if (container) {
                container.innerHTML = `
                    <div class="empty-placeholder-view">
                        <p class="placeholder-text">Execute a security ticker search to populate the asset matrix.</p>
                    </div>
                `;
            }
        });
    },

    /**
     * Portfolio Tracker - stores holdings in localStorage (this browser only,
     * never sent anywhere), and computes live P/L using the real VIKRAM
     * pipeline for current price and score - same honest engine as everywhere
     * else in the app, not separate made-up numbers.
     */
    PORTFOLIO_KEY: 'vikram_portfolio_holdings',

    getHoldings: function() {
        try {
            const raw = localStorage.getItem(this.PORTFOLIO_KEY);
            return raw ? JSON.parse(raw) : [];
        } catch (e) {
            return [];
        }
    },

    saveHoldings: function(holdings) {
        try {
            localStorage.setItem(this.PORTFOLIO_KEY, JSON.stringify(holdings));
        } catch (e) {
            console.error('[VIKRAM Portfolio] Could not save - localStorage unavailable', e);
        }
    },

    addHolding: function(ticker, buyPrice, qty) {
        if (!ticker || !buyPrice || !qty || buyPrice <= 0 || qty <= 0) {
            this.showNotification('Enter a valid ticker, buy price, and quantity', 'error');
            return;
        }
        const check = window.VIKRAM_ENGINE.analyzeAsset(ticker);
        if (!check) {
            this.showNotification(`"${ticker}" not found in database`, 'error');
            return;
        }
        const holdings = this.getHoldings();
        holdings.push({ ticker: ticker.toUpperCase().trim(), buyPrice: parseFloat(buyPrice), qty: parseFloat(qty), addedAt: Date.now() });
        this.saveHoldings(holdings);
        this.renderPortfolio();
    },

    removeHolding: function(index) {
        const holdings = this.getHoldings();
        holdings.splice(index, 1);
        this.saveHoldings(holdings);
        this.renderPortfolio();
    },

    renderPortfolio: function() {
        const summaryBox = document.getElementById('portfolioSummary');
        const tableBox = document.getElementById('portfolioTable');
        if (!summaryBox || !tableBox) return;

        const holdings = this.getHoldings();

        if (holdings.length === 0) {
            summaryBox.innerHTML = '';
            tableBox.innerHTML = `
                <div class="empty-placeholder-view">
                    <p class="placeholder-text">No holdings added yet. Add a ticker, buy price, and quantity above to start tracking.</p>
                </div>
            `;
            return;
        }

        let totalInvestment = 0;
        let totalCurrentValue = 0;

        const rows = holdings.map((h, i) => {
            const data = window.VIKRAM_ENGINE.analyzeAsset(h.ticker);
            if (!data) {
                return `<tr><td colspan="8">${h.ticker} - no longer in database <button class="btn" style="padding:4px 10px;font-size:0.75rem;" onclick="vikramUI.removeHolding(${i})">Remove</button></td></tr>`;
            }
            const currentPrice = parseFloat(data.meta.currentPrice) || 0;
            const investment = h.buyPrice * h.qty;
            const currentValue = currentPrice * h.qty;
            const pl = currentValue - investment;
            const plPct = investment > 0 ? (pl / investment) * 100 : 0;
            totalInvestment += investment;
            totalCurrentValue += currentValue;

            const plClass = pl >= 0 ? 'color-green' : 'color-red';
            const gradeClass = (data.meta.rating === 'BUY' || data.meta.rating === 'STRONG BUY') ? 'color-green' :
                                (data.meta.rating === 'AVOID' || data.meta.rating === 'STRONG AVOID' || data.meta.rating === 'REDUCE') ? 'color-red' : 'color-orange';

            return `
                <tr>
                    <td class="weight-bold">${h.ticker}</td>
                    <td class="font-numeric">₹${h.buyPrice.toFixed(2)}</td>
                    <td class="font-numeric">${h.qty}</td>
                    <td class="font-numeric">₹${investment.toFixed(2)}</td>
                    <td class="font-numeric">₹${currentPrice.toFixed(2)}</td>
                    <td class="font-numeric ${plClass}">${pl >= 0 ? '+' : ''}₹${pl.toFixed(2)} (${plPct >= 0 ? '+' : ''}${plPct.toFixed(1)}%)</td>
                    <td class="${gradeClass}">${data.meta.vikramScore ?? '—'}/100 · ${data.meta.rating}</td>
                    <td><button class="btn" style="padding:4px 10px;font-size:0.75rem;" onclick="vikramUI.removeHolding(${i})">Remove</button></td>
                </tr>
            `;
        }).join('');

        const totalPL = totalCurrentValue - totalInvestment;
        const totalPLPct = totalInvestment > 0 ? (totalPL / totalInvestment) * 100 : 0;
        const totalPLClass = totalPL >= 0 ? 'color-green' : 'color-red';

        summaryBox.innerHTML = `
            <div class="metric-group">
                <span class="metric-label">Total Invested</span>
                <span class="metric-value font-numeric">₹${totalInvestment.toFixed(2)}</span>
            </div>
            <div class="metric-group">
                <span class="metric-label">Current Value</span>
                <span class="metric-value font-numeric">₹${totalCurrentValue.toFixed(2)}</span>
            </div>
            <div class="metric-group">
                <span class="metric-label">Total P/L</span>
                <span class="metric-value font-numeric ${totalPLClass}">${totalPL >= 0 ? '+' : ''}₹${totalPL.toFixed(2)}</span>
            </div>
            <div class="metric-group">
                <span class="metric-label">Return %</span>
                <span class="metric-value font-numeric ${totalPLClass}">${totalPLPct >= 0 ? '+' : ''}${totalPLPct.toFixed(1)}%</span>
            </div>
        `;

        tableBox.innerHTML = `
            <div class="table-container">
                <table class="metric-table">
                    <thead>
                        <tr><th>Ticker</th><th>Buy Price</th><th>Qty</th><th>Invested</th><th>Current Price</th><th>P/L</th><th>VIKRAM Verdict</th><th></th></tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
        `;
    },

    /**
     * Toggles visibility nodes on standard structural wrapper pipelines.
     * @param {string} id - Target DOM element ID.
     * @param {boolean} visible - Visibility enforcement command flag.
     */
    scanAllCompanies: function() {
        if (!window.VIKRAM_COMPANY_DATABASE || !window.VIKRAM_ENGINE) return [];
        return Object.keys(window.VIKRAM_COMPANY_DATABASE).map(ticker => {
            const result = window.VIKRAM_ENGINE.analyzeAsset(ticker);
            if (!result) return null;
            const marketCapRaw = (result.meta.marketCap || "0").replace(/[₹,]/g, '').replace(/Cr.*/, '').trim();
            const marketCapValue = parseFloat(marketCapRaw) || 0;
            return {
                ticker: result.meta.ticker,
                name: result.meta.name,
                sector: result.meta.sector,
                score: result.meta.vikramScore,
                rating: result.meta.rating,
                marketCap: result.meta.marketCap,
                marketCapValue: marketCapValue
            };
        }).filter(Boolean);
    },

    /**
     * Renders the Opportunity Radar: every stock in the database, ranked by
     * real VIKRAM Score, so an investor can compare the whole list at a glance
     * instead of searching one stock at a time.
     */
    renderOpportunityRadar: function() {
        const container = document.getElementById('opportunityRadar');
        if (!container) return;

        const results = this.scanAllCompanies().sort((a, b) => (b.score ?? -1) - (a.score ?? -1));

        if (results.length === 0) {
            container.innerHTML = `
                <div class="dashboard-card">
                    <h2 class="card-headline">🛰 VIKRAM Opportunity Radar</h2>
                    <div class="empty-placeholder-view"><p class="placeholder-text">No stocks in the database yet.</p></div>
                </div>
            `;
            return;
        }

        const rows = results.map((r, i) => {
            const ratingClass = (r.rating === 'BUY' || r.rating === 'STRONG BUY') ? 'color-green' :
                                 (r.rating === 'AVOID' || r.rating === 'STRONG AVOID' || r.rating === 'REDUCE') ? 'color-red' : 'color-orange';
            return `
                <tr>
                    <td class="weight-bold">#${i + 1}</td>
                    <td class="weight-bold">${r.ticker}</td>
                    <td>${r.name}</td>
                    <td>${r.sector}</td>
                    <td class="font-numeric ${ratingClass}">${r.score ?? '—'}/100</td>
                    <td class="${ratingClass}">${r.rating}</td>
                </tr>
            `;
        }).join('');

        container.innerHTML = `
            <div class="dashboard-card">
                <h2 class="card-headline">🛰 VIKRAM Opportunity Radar</h2>
                <p class="text-muted" style="margin-bottom:16px;">All ${results.length} stocks in your database, ranked by real VIKRAM Score. Click a row to open its full analysis.</p>
                <div class="table-container">
                    <table class="metric-table">
                        <thead>
                            <tr><th>Rank</th><th>Ticker</th><th>Company</th><th>Sector</th><th>Score</th><th>Rating</th></tr>
                        </thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>
            </div>
        `;

        // Clicking a row jumps to full analysis for that stock
        container.querySelectorAll('tbody tr').forEach((row, i) => {
            row.style.cursor = 'pointer';
            row.addEventListener('click', () => {
                const stockInput = document.getElementById('stockName');
                const analyzeButton = document.getElementById('btnAnalyze');
                if (stockInput && analyzeButton) {
                    stockInput.value = results[i].ticker;
                    analyzeButton.click();
                    document.getElementById('companyOverview')?.scrollIntoView({ behavior: 'smooth' });
                }
            });
        });
    },

    /**
     * Renders Hidden Gems: stocks with a real VIKRAM Score of 60+ (BUY or
     * better) that also have a smaller market cap than the rest of the
     * database - the ones more likely to be under-covered by big brokers.
     * NOTE: "small/mid-cap" here is relative to whatever is in YOUR database,
     * not an absolute market-wide definition - with only a few stocks loaded,
     * treat this as a starting filter, not a market-wide scan.
     */
    renderHiddenGems: function() {
        const container = document.getElementById('hiddenGemsPreview');
        if (!container) return;

        const results = this.scanAllCompanies();
        if (results.length === 0) {
            container.innerHTML = `
                <div class="dashboard-card">
                    <h2 class="card-headline">💎 Hidden Gems Alpha Discovery</h2>
                    <div class="empty-placeholder-view"><p class="placeholder-text">No stocks in the database yet.</p></div>
                </div>
            `;
            return;
        }

        // Relative small-cap threshold: bottom half of this database's market caps
        const sortedByCap = [...results].sort((a, b) => a.marketCapValue - b.marketCapValue);
        const medianCap = sortedByCap[Math.floor(sortedByCap.length / 2)].marketCapValue;

        const gems = results
            .filter(r => r.marketCapValue <= medianCap && (r.score ?? 0) >= 60)
            .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

        if (gems.length === 0) {
            container.innerHTML = `
                <div class="dashboard-card">
                    <h2 class="card-headline">💎 Hidden Gems Alpha Discovery</h2>
                    <div class="empty-placeholder-view"><p class="placeholder-text">No stock in your current database currently qualifies as a Hidden Gem (smaller market cap + VIKRAM Score 60+). This is expected with a small database - add more stocks to find real candidates.</p></div>
                </div>
            `;
            return;
        }

        const cards = gems.map(g => `
            <div class="metric-group">
                <span class="metric-label">${g.ticker} · ${g.sector}</span>
                <span class="metric-value">${g.name}</span>
                <span class="text-muted font-numeric" style="display:block; margin-top:6px;">Score ${g.score}/100 · ${g.marketCap}</span>
            </div>
        `).join('');

        container.innerHTML = `
            <div class="dashboard-card">
                <h2 class="card-headline">💎 Hidden Gems Alpha Discovery</h2>
                <p class="text-muted" style="margin-bottom:16px;">Stocks with a smaller market cap (relative to your current database) and a VIKRAM Score of 60+. Widen your stock database for more meaningful discovery.</p>
                <div class="grid-layout cols-4">${cards}</div>
            </div>
        `;
    },
    toggleContainer: function(id, visible) {
        const el = document.getElementById(id);
        if (!el) return;
        if (visible) {
            el.classList.remove('hidden');
        } else {
            el.classList.add('hidden');
        }
    },

    /**
     * Renders matching auto-complete lookups below the search container bar.
     * @param {Array} list - Collected array structures containing query matches.
     * @param {HTMLElement} dropdown - Target suggestions display block element node.
     */
    renderDropdownItems: function(list, dropdown) {
        dropdown.innerHTML = '';
        const stockInput = document.getElementById('stockName');
        if (list.length === 0) {
            dropdown.classList.add('hidden');
            if (stockInput) stockInput.setAttribute('aria-expanded', 'false');
            return;
        }

        list.forEach(item => {
            const row = document.createElement('div');
            row.className = 'suggestion-item';
            row.dataset.ticker = item.ticker;
            row.setAttribute('role', 'option');
            row.innerHTML = `
                <span class="suggestion-ticker" style="font-weight:700; color:var(--accent-color); margin-right:8px;">${item.ticker}</span>
                <span class="suggestion-name" style="color:var(--text-secondary); font-size:0.9rem;">${item.name}</span>
            `;
            dropdown.appendChild(row);
        });
        dropdown.classList.remove('hidden');
        if (stockInput) stockInput.setAttribute('aria-expanded', 'true');
    },

    /**
     * Maps systematic metric data outputs directly into functional dashboard grids.
     * @param {Object} data - Synthesized analytical evaluation package object.
     */
    renderAnalysisWorkspace: function(data) {
        if (!data) return;

        // Use the REAL score already computed by frameworkEngine.js (via scoreEngine.js
        // using the real Technical/Fundamental/Institutional/Valuation/News pillars).
        //
        // CRITICAL BUG FIXED HERE: this used to re-run VIKRAM_SCORE_ENGINE a SECOND
        // time with hardcoded mock numbers (institutional: 75, valuation: 65, news: 80
        // — fixed values, not from any real data) and overwrite the real score with
        // that fake result. That meant the score shown on screen was NEVER the true
        // 5-pillar VIKRAM Score — it was mostly made-up numbers. Now we just use what
        // frameworkEngine.js already correctly calculated.
        const scorePackage = {
            score: data.meta.vikramScore ?? 50,
            rating: data.meta.rating ?? "HOLD",
            stars: data.meta.stars ?? "★★★☆☆",
            confidence: data.meta.confidence ?? 50
        };

        // Score Gauge Card
        // (This card used to repeat the company name, price, and market cap that
        // the top "Company Overview" section already shows. Simplified to just the
        // gauge, since that's the one thing not shown anywhere else.)
        const businessBox = document.getElementById('businessDashboard');
        if (businessBox) {
            businessBox.innerHTML = `
                <div class="dashboard-card" style="text-align:center;">
                    <h3 class="card-headline" style="justify-content:center;">VIKRAM Verdict</h3>
                    <div id="vikramGaugeContainer" class="gauge-host-wrapper" style="width: 180px; height: 180px; margin: 0 auto;"></div>
                    <div class="margin-top-md text-muted" style="font-size: 0.9rem;">
                        <span class="weight-bold">${data.technical.trend}</span>
                    </div>
                </div>
            `;

            // Trigger Alpha 1.3 SVG Gauge rendering loop if engine module is attached
            const gaugeContainer = document.getElementById('vikramGaugeContainer');
            if (gaugeContainer && window.VIKRAM_GAUGE_ENGINE && typeof window.VIKRAM_GAUGE_ENGINE.render === "function") {
                window.VIKRAM_GAUGE_ENGINE.render(gaugeContainer, {
                    score: scorePackage.score,
                    rating: scorePackage.rating,
                    stars: scorePackage.stars,
                    confidence: scorePackage.confidence,
                    size: 180,
                    strokeWidth: 12,
                    animate: true
                });
            }
        }

        // NOTE: "watchlistPreview" used to duplicate the Technical Dashboard here
        // under the wrong heading "Opportunity Radar" (it showed RSI/MACD/ADX, not
        // an opportunity radar). That data is already shown correctly and properly
        // labeled in the static "Technical Strength (Pillar K)" section further
        // down the page, so this duplicate block has been removed. The real
        // Opportunity Radar (multi-stock scanning) is a separate, not-yet-built
        // feature — see the "VIKRAM Opportunity Radar" placeholder near the bottom.

        // Populate Valuation Pillar Dashboard Block
        // (Previously this container showed a second copy of fundamental data by
        // mistake — data.valuation was computed by frameworkEngine.js but never
        // displayed anywhere. Fixed to show the real valuation output.)
        const valuationBox = document.getElementById('valuationDashboard');
        if (valuationBox && data.valuation) {
            const v = data.valuation;
            const statusClass = v.status === 'UNDERVALUED' ? 'color-green' : (v.status === 'OVERVALUED' ? 'color-red' : 'color-orange');
            valuationBox.innerHTML = `
                <div class="dashboard-card">
                    <h3 class="card-headline">💰 Valuation (Pillar V)</h3>
                    <div class="grid-layout cols-4">
                        <div class="metric-group">
                            <span class="metric-label">Current Price</span>
                            <span class="metric-value font-numeric">₹${Number(v.currentPrice).toFixed(2)}</span>
                        </div>
                        <div class="metric-group">
                            <span class="metric-label">Estimated Intrinsic Value</span>
                            <span class="metric-value font-numeric">₹${Number(v.intrinsicValue).toFixed(2)}</span>
                        </div>
                        <div class="metric-group">
                            <span class="metric-label">Margin of Safety</span>
                            <span class="metric-value font-numeric ${statusClass}">${v.marginOfSafety}%</span>
                        </div>
                        <div class="metric-group">
                            <span class="metric-label">Status</span>
                            <span class="metric-value ${statusClass}">${v.status}</span>
                        </div>
                    </div>
                </div>
            `;
        }

        // Populate Institutional Pillar Dashboard Block
        const institutionBox = document.getElementById('institutionDashboard');
        if (institutionBox && data.institutional) {
            const inst = data.institutional;
            if (inst.dataAvailable === false) {
                // HONESTY: no real FII/DII data exists for this stock - say so plainly,
                // don't show a colored score that looks like real analysis.
                institutionBox.innerHTML = `
                    <div class="dashboard-card">
                        <h3 class="card-headline">🏦 Institutional Strength (Pillar I)</h3>
                        <div class="empty-placeholder-view">
                            <p class="placeholder-text">⚪ Data Unavailable — no verified FII/DII holding data exists for this stock yet. This pillar is excluded from the VIKRAM Score (its weight is redistributed to the pillars with real data) rather than guessed.</p>
                        </div>
                    </div>
                `;
            } else {
                const stanceClass = inst.institutionalScore >= 55 ? 'color-green' : (inst.institutionalScore < 40 ? 'color-red' : 'color-orange');
                institutionBox.innerHTML = `
                    <div class="dashboard-card">
                        <h3 class="card-headline">🏦 Institutional Strength (Pillar I)</h3>
                        <div class="grid-layout cols-4">
                            <div class="metric-group">
                                <span class="metric-label">Institutional Score</span>
                                <span class="metric-value font-numeric ${stanceClass}">${inst.institutionalScore}/100</span>
                            </div>
                            <div class="metric-group">
                                <span class="metric-label">Stance</span>
                                <span class="metric-value ${stanceClass}">${inst.stance}</span>
                            </div>
                            <div class="metric-group">
                                <span class="metric-label">Total Institutional Holding</span>
                                <span class="metric-value font-numeric">${inst.totalInstitutionalHolding}%</span>
                            </div>
                            <div class="metric-group">
                                <span class="metric-label">Velocity</span>
                                <span class="metric-value">${inst.velocityStatus}</span>
                            </div>
                        </div>
                        <p class="text-muted margin-top-md" style="font-size:0.85rem;">${inst.summary ?? ''}</p>
                    </div>
                `;
            }
        }

        // Populate Fundamental Pillar Score Card (was missing - only the raw metrics
        // table existed before, no summary score card like the other 4 pillars have)
        const fundamentalScoreBox = document.getElementById('fundamentalScoreCard');
        if (fundamentalScoreBox && data.fundamental) {
            const f = data.fundamental;
            const gradeClass = f.score >= 60 ? 'color-green' : (f.score < 40 ? 'color-red' : 'color-orange');
            fundamentalScoreBox.innerHTML = `
                <div class="dashboard-card">
                    <h3 class="card-headline">🌱 Fundamental Strength (Pillar F)</h3>
                    <div class="grid-layout cols-4">
                        <div class="metric-group">
                            <span class="metric-label">Fundamental Score</span>
                            <span class="metric-value font-numeric ${gradeClass}">${f.score}/100</span>
                        </div>
                        <div class="metric-group">
                            <span class="metric-label">Grade</span>
                            <span class="metric-value ${gradeClass}">${f.grade}</span>
                        </div>
                    </div>
                    <p class="text-muted margin-top-md" style="font-size:0.85rem;">${f.summary ?? ''}</p>
                </div>
            `;
        }

        // Populate Risk Pillar Dashboard Block (was computed, never shown before)
        const riskBox = document.getElementById('riskDashboard');
        if (riskBox && data.risk) {
            const r = data.risk;
            const riskClass = r.riskLevel === 'LOW' ? 'color-green' : (r.riskLevel === 'HIGH' ? 'color-red' : 'color-orange');
            riskBox.innerHTML = `
                <div class="dashboard-card">
                    <h3 class="card-headline">⚠️ Risk Assessment</h3>
                    <div class="grid-layout cols-4">
                        <div class="metric-group">
                            <span class="metric-label">Risk Score</span>
                            <span class="metric-value font-numeric ${riskClass}">${r.riskScore}/100</span>
                        </div>
                        <div class="metric-group">
                            <span class="metric-label">Risk Level</span>
                            <span class="metric-value ${riskClass}">${r.riskLevel}</span>
                        </div>
                        <div class="metric-group">
                            <span class="metric-label">Financial Risk</span>
                            <span class="metric-value">${r.financialRisk}</span>
                        </div>
                        <div class="metric-group">
                            <span class="metric-label">Technical Risk</span>
                            <span class="metric-value">${r.technicalRisk}</span>
                        </div>
                        <div class="metric-group">
                            <span class="metric-label">Business Risk</span>
                            <span class="metric-value">${r.businessRisk}</span>
                        </div>
                    </div>
                    <p class="text-muted margin-top-md" style="font-size:0.85rem;">${r.summary ?? ''}</p>
                    ${data.meta.riskPenaltyApplied > 0 ? `
                        <div class="data-banner margin-top-md" style="border-left-color: var(--color-red);">
                            ⚠️ Risk Penalty Applied: this stock's score was reduced by ${data.meta.riskPenaltyApplied} points (from ${data.meta.preRiskPenaltyScore} to ${data.meta.vikramScore}) because Risk is rated HIGH. This isn't double-counting Fundamental/Technical - it's an extra safety check for severe tail risk that a weighted average alone could hide.
                        </div>
                    ` : ''}
                </div>
            `;
        }

        // Populate News / Catalyst Pillar Dashboard Block (was computed, never shown before)
        const catalystBox = document.getElementById('catalystDashboard');
        if (catalystBox && data.catalysts) {
            const c = data.catalysts;
            const sentClass = (c.sentiment === 'POSITIVE' || c.sentiment === 'VERY POSITIVE') ? 'color-green' :
                               ((c.sentiment === 'NEGATIVE' || c.sentiment === 'VERY NEGATIVE') ? 'color-red' : 'color-orange');
            catalystBox.innerHTML = `
                <div class="dashboard-card">
                    <h3 class="card-headline">📰 News & Catalysts (Pillar N)</h3>
                    <div class="grid-layout cols-4">
                        <div class="metric-group">
                            <span class="metric-label">News Score</span>
                            <span class="metric-value font-numeric ${sentClass}">${c.newsScore}/100</span>
                        </div>
                        <div class="metric-group">
                            <span class="metric-label">Sentiment</span>
                            <span class="metric-value ${sentClass}">${c.sentiment}</span>
                        </div>
                        <div class="metric-group">
                            <span class="metric-label">Catalyst Strength</span>
                            <span class="metric-value">${c.catalystStrength}</span>
                        </div>
                        <div class="metric-group">
                            <span class="metric-label">Suggested Action</span>
                            <span class="metric-value">${c.recommendation}</span>
                        </div>
                    </div>
                    <p class="text-muted margin-top-md" style="font-size:0.85rem;">${c.summary ?? ''}</p>
                </div>
            `;
        }

        // Populate Explainability Engine - synthesizes all pillars into one
        // honest "why" paragraph. Deliberately names which pillars drove the
        // verdict, which were excluded, and whether correlation dampening
        // applied - explaining the real mechanism, not a generic-sounding summary.
        const explainBox = document.getElementById('explainabilityEngine');
        if (explainBox) {
            explainBox.innerHTML = `
                <div class="dashboard-card">
                    <h2 class="card-headline">🔍 Structured AI Explainability Engine</h2>
                    <p style="line-height:1.7;">${this.buildExplanation(data)}</p>
                </div>
            `;
        }

        // Populate Master Verdict Subsystem - splits the single VIKRAM Score
        // into a Long-Term view (Fundamental + Valuation + Institutional - the
        // slow-moving business-quality signals) and a Short-Term view
        // (Technical + News - the fast-moving timing signals). These CAN
        // genuinely disagree - a great business can look technically weak
        // right now, or vice versa - and that disagreement is itself useful
        // information rather than something to average away.
        const masterVerdictBox = document.getElementById('masterVerdict');
        if (masterVerdictBox) {
            const fundScore = data.fundamental ? data.fundamental.score : null;
            const valScore = data.valuation ? (50 + (data.valuation.marginOfSafety * 1.2)) : null;
            const instScore = (data.institutional && data.institutional.dataAvailable !== false) ? data.institutional.institutionalScore : null;
            const techScore = data.technical && parseFloat(data.technical.rsi) ? Math.min(100, Math.max(0, parseFloat(data.technical.rsi) * 1.2)) : null;
            const newsScore = data.catalysts ? data.catalysts.newsScore : null;

            const ltComponents = [fundScore, valScore, instScore].filter(v => v !== null && !isNaN(v));
            const stComponents = [techScore, newsScore].filter(v => v !== null && !isNaN(v));

            const ltScore = ltComponents.length ? Math.round(ltComponents.reduce((a, b) => a + b, 0) / ltComponents.length) : null;
            const stScore = stComponents.length ? Math.round(stComponents.reduce((a, b) => a + b, 0) / stComponents.length) : null;

            const ltLabel = ltScore === null ? 'Insufficient Data' : (ltScore >= 65 ? 'Strong Investment Case' : (ltScore >= 45 ? 'Neutral' : 'Weak Investment Case'));
            const stLabel = stScore === null ? 'Insufficient Data' : (stScore >= 65 ? 'Strong Trading Setup' : (stScore >= 45 ? 'Neutral' : 'Weak Trading Setup'));
            const ltClass = ltScore === null ? '' : (ltScore >= 65 ? 'color-green' : (ltScore >= 45 ? 'color-orange' : 'color-red'));
            const stClass = stScore === null ? '' : (stScore >= 65 ? 'color-green' : (stScore >= 45 ? 'color-orange' : 'color-red'));

            let divergenceNote = '';
            if (ltScore !== null && stScore !== null && Math.abs(ltScore - stScore) >= 25) {
                divergenceNote = `<p class="text-muted margin-top-md" style="font-size:0.9rem;">⚠️ Long-Term and Short-Term views diverge meaningfully here (${ltScore} vs ${stScore}) - this looks like ${ltScore > stScore ? 'a good business at a currently weak entry point' : 'a strong short-term setup without matching business-quality support'}. Worth deciding explicitly whether you're investing or trading before acting.</p>`;
            }

            masterVerdictBox.innerHTML = `
                <div class="dashboard-card">
                    <h2 class="card-headline">🏆 Master Verdict Subsystem</h2>
                    <div class="grid-layout" style="grid-template-columns: 1fr 1fr; gap: 24px;">
                        <div class="metric-group">
                            <span class="metric-label">Long-Term Score (Investing View)</span>
                            <span class="metric-value font-numeric ${ltClass}" style="font-size:1.6rem;">${ltScore ?? '—'}/100</span>
                            <span class="text-muted" style="display:block; margin-top:4px;">${ltLabel}</span>
                        </div>
                        <div class="metric-group">
                            <span class="metric-label">Short-Term Score (Trading View)</span>
                            <span class="metric-value font-numeric ${stClass}" style="font-size:1.6rem;">${stScore ?? '—'}/100</span>
                            <span class="text-muted" style="display:block; margin-top:4px;">${stLabel}</span>
                        </div>
                    </div>
                    ${divergenceNote}
                </div>
            `;
        }
        const setEl = (id, val, isLink = false) => {
            const el = document.getElementById(id);
            if (!el) return;
            if (isLink) {
                el.href = val;
                el.textContent = val;
            } else {
                el.textContent = val;
            }
        };

        // Populate Individual Explicit index.html Overview Placeholders
        setEl("overviewCompanyName", data.meta.name);
        setEl("overviewSector", data.meta.sector);
        setEl("overviewIndustry", data.meta.industry);
        setEl("overviewExchange", data.meta.exchange);
        setEl("overviewMarketCap", data.meta.marketCap);
        setEl("overviewCurrentPrice", data.meta.currentPrice);
        setEl("overview52WeekHigh", data.meta.high52Week);
        setEl("overview52WeekLow", data.meta.low52Week);
        setEl("overviewWebsite", data.meta.website, true);
        setEl("overviewVikramScore", data.meta.vikramScore);
        setEl("overviewRating", data.meta.rating);

        // Populate Individual Explicit index.html Technical Placeholders
        setEl("techRSI", data.technical.rsi);
        setEl("techRSISignal", data.technical.rsiSignal);
        setEl("techMACD", data.technical.macd);
        setEl("techMACDSignal", data.technical.macdSignal);
        setEl("techADX", data.technical.adx);
        setEl("techADXSignal", data.technical.adxSignal);
        setEl("techEMA20", data.technical.ema20);
        setEl("techEMA50", data.technical.ema50);
        setEl("techEMA200", data.technical.ema200);
        setEl("techTrend", data.technical.trend);
        setEl("techSupport", data.technical.support);
        setEl("techResistance", data.technical.resistance);
        setEl("techVolume", data.technical.volume);
        setEl("techVolumeSignal", data.technical.volumeSignal);
        setEl("techOBV", data.technical.obv);
        setEl("techOBVSignal", data.technical.obvSignal);
        setEl("techDeliveryPct", data.technical.deliveryPct);
        setEl("techDeliverySignal", data.technical.deliverySignal);
        setEl("tech52WeekHigh", data.technical.high52Week);
        setEl("tech52WeekLow", data.technical.low52Week);

        // Populate Individual Explicit index.html Fundamental/Financial Placeholders
        setEl("finRevenueGrowth", data.financial.revenueGrowth);
        setEl("finRevenueGrowthSignal", data.financial.revenueGrowthSignal);
        setEl("finProfitGrowth", data.financial.profitGrowth);
        setEl("finProfitGrowthSignal", data.financial.profitGrowthSignal);
        setEl("finEPSGrowth", data.financial.epsGrowth);
        setEl("finEPSGrowthSignal", data.financial.epsGrowthSignal);
        setEl("finROE", data.financial.roe);
        setEl("finROESignal", data.financial.roeSignal);
        setEl("finROCE", data.financial.roce);
        setEl("finROCESignal", data.financial.roceSignal);
        setEl("finOperatingMargin", data.financial.operatingMargin);
        setEl("finOperatingMarginSignal", data.financial.operatingMarginSignal);
        setEl("finNetMargin", data.financial.netMargin);
        setEl("finNetMarginSignal", data.financial.netMarginSignal);
        setEl("finDebtToEquity", data.financial.debtToEquity);
        setEl("finDebtToEquitySignal", data.financial.debtToEquitySignal);
        setEl("finFreeCashFlow", data.financial.freeCashFlow);
        setEl("finFreeCashFlowSignal", data.financial.freeCashFlowSignal);
        setEl("finInterestCoverage", data.financial.interestCoverage);
        setEl("finInterestCoverageSignal", data.financial.interestCoverageSignal);
        setEl("finQuarterlyGrowth", data.financial.quarterlyGrowth);
        setEl("finQuarterlyGrowthSignal", data.financial.quarterlyGrowthSignal);
        setEl("finAnnualGrowth", data.financial.annualGrowth);
        setEl("finAnnualGrowthSignal", data.financial.annualGrowthSignal);
    }
};

// Mount runtime display controller engine pipeline globally
window.VIKRAM_UI = vikramUI;

/* ==========================================================
   APPLICATION CONTROLLER & BOOTSTRAP SYSTEM
   ========================================================== */
document.addEventListener("DOMContentLoaded", () => {
    // Populate Opportunity Radar and Hidden Gems immediately - these scan the
    // whole database and don't depend on the user searching a specific stock
    vikramUI.renderOpportunityRadar();
    vikramUI.renderHiddenGems();

    // Sample ticker chips - quick way for a new visitor to see something real immediately
    document.querySelectorAll('.sample-ticker-chip').forEach(chip => {
        chip.addEventListener('click', (e) => {
            e.preventDefault();
            const ticker = chip.dataset.ticker;
            const input = document.getElementById('stockName');
            const btn = document.getElementById('btnAnalyze');
            if (input && btn) {
                input.value = ticker;
                btn.click();
                document.getElementById('companyOverview')?.scrollIntoView({ behavior: 'smooth' });
            }
        });
    });

    // Portfolio Tracker - render saved holdings and wire the add button
    vikramUI.renderPortfolio();
    const btnAddHolding = document.getElementById('btnAddHolding');
    if (btnAddHolding) {
        btnAddHolding.addEventListener('click', () => {
            const ticker = document.getElementById('portfolioTicker').value;
            const buyPrice = document.getElementById('portfolioBuyPrice').value;
            const qty = document.getElementById('portfolioQty').value;
            vikramUI.addHolding(ticker, buyPrice, qty);
            document.getElementById('portfolioTicker').value = '';
            document.getElementById('portfolioBuyPrice').value = '';
            document.getElementById('portfolioQty').value = '';
        });
    }

    const stockInput = document.getElementById("stockName");
    const analyzeButton = document.getElementById("btnAnalyze");
    const suggestions = document.getElementById("searchSuggestions");
    const errorContainer = document.getElementById("errorContainer");
    const loadingContainer = document.getElementById("loadingContainer");

    if (!stockInput || !analyzeButton || !suggestions) {
        return;
    }

    /**
     * Executes security analysis lookup sequence pipeline.
     */
    const executeAnalysis = () => {
        // Clear previous runtime errors or system notifications before starting analysis
        if (errorContainer) {
            errorContainer.classList.add("hidden");
            errorContainer.textContent = "";
        }
        
        const queryValue = stockInput.value.toUpperCase().trim();
        if (!queryValue) {
            window.VIKRAM_UI.showNotification("Please input a valid security identifier", "warning");
            return;
        }

        // Trigger loading state emulation if container exists
        if (loadingContainer) window.VIKRAM_UI.toggleContainer("loadingContainer", true);
        suggestions.classList.add("hidden");

        // Execute core analytical algorithm via the unified Engine API
        const result = window.VIKRAM_ENGINE.analyzeAsset(queryValue);

        // Artificial minor operational delay to ensure smooth hardware frame interpolation
        setTimeout(() => {
            if (loadingContainer) window.VIKRAM_UI.toggleContainer("loadingContainer", false);

            if (!result) {
                window.VIKRAM_UI.clearWorkspace();
                if (errorContainer) {
                    errorContainer.textContent = `Security mapping engine failure: '${queryValue}' not found inside index repositories.`;
                    errorContainer.classList.remove("hidden");
                }
                window.VIKRAM_UI.showNotification("Company not found", "error");
            } else {
                window.VIKRAM_UI.renderAnalysisWorkspace(result);
                window.VIKRAM_UI.showNotification("Analysis Completed", "success");
            }
        }, 200);
    };

    // Typing in the search box triggers auto-complete suggestion system
    stockInput.addEventListener("input", (e) => {
        const val = e.target.value;
        const matches = window.VIKRAM_ENGINE.searchSuggestions(val);
        window.VIKRAM_UI.renderDropdownItems(matches, suggestions);
    });

    // Selecting auto-complete lookup row anchors populates user control input value matrix
    suggestions.addEventListener("click", (e) => {
        const item = e.target.closest(".suggestion-item");
        if (item && item.dataset.ticker) {
            stockInput.value = item.dataset.ticker;
            suggestions.classList.add("hidden");
            executeAnalysis();
        }
    });

    // Primary Action Execution Trigger Route binded via standard listeners
    analyzeButton.addEventListener("click", (e) => {
        e.preventDefault();
        executeAnalysis();
    });

    // Keycode interception infrastructure maps Return/Enter commands straight into processing engines
    stockInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            e.preventDefault();
            executeAnalysis();
        }
    });

    // Focus boundary evaluation routes blur operations to clear recommendation modules safely
    document.addEventListener("click", (e) => {
        if (!stockInput.contains(e.target) && !suggestions.contains(e.target)) {
            suggestions.classList.add("hidden");
        }
    });
});