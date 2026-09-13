/*!
 * VIKRAM Guide — Global Contextual AI Help
 * ------------------------------------------------------------------
 * Single reusable module, included on every VIKRAM page, that renders
 * a persistent "May I help you?" entry point and a lightweight
 * contextual help panel.
 *
 * WHAT THIS IS
 *   - A deterministic, rule-based navigation/explanation assistant.
 *   - It knows VIKRAM's real page/section inventory and real routes.
 *   - It never invents prices, scores, signals, or analytical results.
 *
 * WHAT THIS IS NOT (by design, per assignment "NO FABRICATED BACKEND")
 *   - This is NOT wired to a live AI/LLM backend. There is no network
 *     call here and no provider key of any kind on the client.
 *   - INTEGRATION_BOUNDARY (see below) is the single place a future
 *     backend-backed AI call would be added. Until that exists, any
 *     question that requires live VIKRAM data (a price, a score value,
 *     "why did this signal fire", portfolio numbers, etc.) is answered
 *     with an explicit DATA N/A style message instead of a guess.
 *
 * Safe to include on any page: initialization is idempotent, the
 * script does not touch scoring/signal/backtest logic, and it only
 * ever reads the DOM (page id, current hash, optional data attributes)
 * — it never mutates existing page state.
 */
(function () {
  'use strict';

  // Guard against duplicate mounting (e.g. script included twice).
  if (window.__vikramGuideInitialized) return;
  window.__vikramGuideInitialized = true;

  // ------------------------------------------------------------------
  // 1. PAGE / SECTION CONTEXT REGISTRY
  //    Real routes only — copied from the actual nav (index.html side
  //    nav + standalone pages). Do not invent routes here.
  // ------------------------------------------------------------------

  var ROUTES = {
    home: 'index.html',
    scanner: 'index.html#scannerSurface',
    companyOverview: 'index.html#companyOverview',
    opportunityRadar: 'index.html#opportunityRadar',
    hiddenGems: 'index.html#hiddenGems',
    portfolio: 'index.html#portfolio',
    vikramLite: 'index.html#vikramLite',
    marketInsights: 'index.html#marketInsights',
    learningHub: 'index.html#learningHub',
    analytics: 'index.html#analytics',
    settings: 'index.html#settings',
    nseData: 'nse-data.html',
    research: 'research.html',
    standaloneScanner: 'scanner.html',
    alerts: 'alerts.html',
    about: 'about.html',
    // Added during merge: these pages did not exist when vikramGuide.js was authored, so the
    // Guide had zero awareness of them (not even the generic fallback ROUTES/CONTEXTS provide
    // for an unrecognized key). Kept minimal and in the same honest style as the surrounding
    // entries -- not a rewrite of the Guide's own authored content.
    discover: 'discover.html',
    academy: 'academy.html',
    performanceLab: 'performance-lab.html',
    marketIntelligence: 'market-intelligence.html'
  };

  // Each entry: title, one-line description, suggested actions, and
  // (optional) canned answers keyed by suggestion so the same copy is
  // reused for both the button and free-text matches.
  var CONTEXTS = {
    home: {
      title: 'VIKRAM Home',
      description: 'The starting point — quick links into every VIKRAM module.',
      suggestions: [
        { label: 'Explain this page', answer: 'This is the VIKRAM home screen. The cards here link to the Accumulation Scanner, Hidden Gems, Opportunity Radar, VIKRAM Lite, NSE Data & Research, and 1 Year Research — each opens the underlying module directly.' },
        { label: 'What should I look at?', answer: 'If you\u2019re new here, start with the Accumulation Scanner to see verified accumulation evidence, then open a company from there to reach the Company Overview.', nav: 'scanner' },
        { label: 'How do I analyse a company?', answer: 'Go to the Accumulation Scanner or use search to pick a company — that opens the Company Overview with its score, verdict, and evidence.', nav: 'companyOverview' },
        { label: 'What should I do next?', answer: 'Try the Accumulation Scanner first — it\u2019s the core VIKRAM workflow for finding verified evidence before you look at any single company.', nav: 'scanner' }
      ]
    },
    companyOverview: {
      title: 'Company Overview',
      description: 'A single company\u2019s VIKRAM score, verdict, and supporting evidence.',
      suggestions: [
        { label: 'Explain this page', answer: 'This page shows one company\u2019s VIKRAM Score, its current Verdict, and the evidence behind both. Nothing here is estimated — fields VIKRAM can\u2019t verify are shown as N/A rather than guessed.' },
        { label: 'What should I look at?', answer: 'Start with the Verdict and the score breakdown beneath it, then check the evidence/notes VIKRAM shows for why that verdict was reached.' },
        { label: 'Explain this score', answer: 'DATA N/A — the Guide doesn\u2019t currently read the live score shown on your screen, so it can\u2019t restate today\u2019s exact figure. The score panel on this page itself is the source of truth for that number and its components.' },
        { label: 'What should I do next?', answer: 'Compare this company against the Opportunity Radar or Hidden Gems to see how it stacks up against other verified candidates.', nav: 'opportunityRadar' }
      ]
    },
    scanner: {
      title: 'Accumulation Scanner',
      description: 'Finds verified early and confirmed accumulation evidence across the NSE universe.',
      suggestions: [
        { label: 'How does this work?', answer: 'The scanner runs VIKRAM\u2019s rule engine against the supported NSE universe and flags companies with verified accumulation evidence — nothing here is inferred without underlying data.' },
        { label: 'Find strong accumulation', answer: 'Use the filters above the results table (e.g. verdict/status) to narrow to \u201cAccumulation Confirmed\u201d rows, then sort by the detection column.' },
        { label: 'Explain this signal', answer: 'DATA N/A — the Guide can\u2019t read the specific row you\u2019re looking at. Click the \u201cwhy\u201d cell on that row in the table, which shows VIKRAM\u2019s own evidence notes for that detection.' },
        { label: 'What should I do next?', answer: 'Click a company name in the results to open its full Company Overview and see the score/verdict behind the scanner row.', nav: 'companyOverview' }
      ]
    },
    opportunityRadar: {
      title: 'Opportunity Radar',
      description: 'Cross-factor opportunities built from the same verified scanner data — no separate scoring source.',
      suggestions: [
        { label: 'Explain this page', answer: 'Opportunity Radar re-surfaces companies from the same verified scanner data using cross-factor criteria — it does not use a separate score or a new data source.' },
        { label: 'What should I look at?', answer: 'Look at which factors are driving a company\u2019s inclusion here, then open its Company Overview for the full evidence.', nav: 'companyOverview' },
        { label: 'Explain this signal', answer: 'DATA N/A — the Guide doesn\u2019t read individual radar entries. The evidence/notes shown alongside each entry on this page is VIKRAM\u2019s own explanation.' },
        { label: 'What should I do next?', answer: 'Cross-check anything interesting here against the Accumulation Scanner and Hidden Gems for a fuller picture.', nav: 'scanner' }
      ]
    },
    hiddenGems: {
      title: 'Hidden Gems',
      description: 'Discovery candidates from the common verified research layer — flagged as research, not validated.',
      suggestions: [
        { label: 'Explain this page', answer: 'Hidden Gems are discovery candidates pulled from VIKRAM\u2019s verified research layer. They are explicitly marked \u201cresearch — not validated,\u201d meaning they haven\u2019t passed the same confirmation bar as scanner verdicts.' },
        { label: 'What should I look at?', answer: 'Treat this list as ideas to investigate further, not confirmed calls — open a candidate\u2019s Company Overview before acting on it.', nav: 'companyOverview' },
        { label: 'What should I do next?', answer: 'Cross-reference a candidate against the Accumulation Scanner and 1 Year Research before treating it as actionable.', nav: 'research' }
      ]
    },
    portfolio: {
      title: 'Portfolio',
      description: 'Your holdings view — verified values only, unavailable data stays N/A.',
      suggestions: [
        { label: 'Explain this page', answer: 'This is your portfolio view. VIKRAM only shows values it can verify; anything it can\u2019t confirm is left as N/A instead of estimated.' },
        { label: 'What should I look at?', answer: 'DATA N/A — the Guide doesn\u2019t read your holdings data. Everything about your specific positions and returns lives on this page itself.' },
        { label: 'What should I do next?', answer: 'Use the Accumulation Scanner or Opportunity Radar to look for evidence on names you\u2019re watching.', nav: 'scanner' }
      ]
    },
    marketInsights: {
      title: 'Market Insights',
      description: 'Index-level snapshot of the broader market.',
      suggestions: [
        { label: 'Explain this page', answer: 'This section gives a snapshot of broad market indices, for context before drilling into individual companies.' },
        { label: 'What should I do next?', answer: 'Head to the Accumulation Scanner to move from broad market context to individual verified evidence.', nav: 'scanner' }
      ]
    },
    vikramLite: {
      title: 'VIKRAM Lite',
      description: 'A lightweight, verified market view for fast, disciplined decisions.',
      suggestions: [
        { label: 'Explain this page', answer: 'VIKRAM Lite is a lightweight verified market view \u2014 the same verification standard as the rest of VIKRAM, presented in a faster, simpler format.' },
        { label: 'What should I do next?', answer: 'If you want the full evidence behind anything you see here, cross-check it in the Accumulation Scanner.', nav: 'scanner' }
      ]
    },
    learningHub: {
      title: 'Learning Hub',
      description: 'A research education surface for understanding VIKRAM concepts.',
      suggestions: [
        { label: 'Explain this page', answer: 'The Learning Hub is VIKRAM\u2019s research education surface \u2014 background material to help you understand VIKRAM\u2019s terms and concepts.' },
        { label: 'What should I do next?', answer: 'Once a concept makes sense here, see it in action on the Accumulation Scanner or a Company Overview.', nav: 'scanner' }
      ]
    },
    analytics: {
      title: 'Analytics',
      description: 'Aggregate statistics computed from the same verified scanner data \u2014 no separate data source, no invented metrics.',
      suggestions: [
        { label: 'Explain this page', answer: 'Analytics aggregates statistics from the same verified scanner data used elsewhere in VIKRAM \u2014 it doesn\u2019t pull from a separate source or invent new metrics.' },
        { label: 'Explain this metric', answer: 'DATA N/A \u2014 the Guide doesn\u2019t read the specific figures shown here; the labels/notes next to each statistic on this page are the source of truth.' },
        { label: 'What should I do next?', answer: 'Use what you see here to sanity-check patterns you noticed in the Accumulation Scanner or Opportunity Radar.', nav: 'scanner' }
      ]
    },
    settings: {
      title: 'Settings',
      description: 'Use the Theme menu above to change the VIKRAM experience.',
      suggestions: [
        { label: 'Explain this page', answer: 'Settings is where you control the VIKRAM experience \u2014 right now that\u2019s the Theme menu above this section.' },
        { label: 'What should I do next?', answer: 'Once you\u2019re happy with your theme, head back to the Accumulation Scanner to continue your research.', nav: 'scanner' }
      ]
    },
    nseData: {
      title: 'NSE Data & Research',
      description: 'What NSE data VIKRAM has stored — coverage, gaps, and real acquisition controls.',
      suggestions: [
        { label: 'Explain this page', answer: 'This page shows exactly what NSE data VIKRAM has stored — CM/F&O coverage, known gaps, and delivery/OI availability — plus controls to trigger real data acquisition.' },
        { label: 'What should I look at?', answer: 'Check the coverage/gap indicators for the segment you care about before relying on downstream scanner or research results for that name.' },
        { label: 'What should I do next?', answer: 'If you find a gap for a company you\u2019re researching, use this page\u2019s acquisition controls, then revisit its Company Overview.', nav: 'companyOverview' }
      ]
    },
    research: {
      title: '1 Year Research',
      description: 'The verified ~1-year NSE history: historical accumulation signals, forward returns, and data coverage.',
      suggestions: [
        { label: 'Explain this page', answer: 'This is VIKRAM\u2019s ~1-year verified research layer: historical accumulation signals, how they performed afterward, and the underlying data coverage — including the Accumulation Success Matrix.' },
        { label: 'How do I run a backtest?', answer: 'DATA N/A for a live run from here — this page shows VIKRAM\u2019s existing verified backtest/research results rather than a place to launch a new ad-hoc backtest.' },
        { label: 'Explain these results', answer: 'DATA N/A — the Guide doesn\u2019t read the specific figures shown. The Accumulation Success Matrix and surrounding notes on this page are VIKRAM\u2019s own explanation of those results.' },
        { label: 'Explain this metric', answer: 'DATA N/A — hover or check the column header/notes on this page for the definition of a specific metric; the Guide doesn\u2019t have a separate copy of live values.' },
        { label: 'What should I do next?', answer: 'Use what you find here to sanity-check candidates from the Accumulation Scanner or Hidden Gems before treating them as actionable.', nav: 'scanner' }
      ]
    },
    alerts: {
      title: 'Alerts',
      description: 'Manage accumulation/price alerts.',
      suggestions: [
        { label: 'Explain this page', answer: 'This page lets you set up and manage alerts so VIKRAM can flag changes you care about without you checking manually.' },
        { label: 'What should I do next?', answer: 'Set an alert on a company you found via the Accumulation Scanner or Opportunity Radar.', nav: 'scanner' }
      ]
    },
    about: {
      title: 'About VIKRAM',
      description: 'Background on what VIKRAM is and how it works.',
      suggestions: [
        { label: 'Explain this page', answer: 'This page explains what VIKRAM is, its verification-first approach, and how to get started.' },
        { label: 'What should I do next?', answer: 'Head to the Accumulation Scanner to see VIKRAM\u2019s core workflow in action.', nav: 'scanner' }
      ]
    },
    // Added during merge (same reasoning as the ROUTES additions above): kept short and honest,
    // in the Guide's own voice, rather than expanded content this assignment doesn't own.
    discover: {
      title: 'Discover',
      description: 'A hub linking the Accumulation Scanner, Hidden Gems, Opportunity Radar, and VIKRAM Lite.',
      suggestions: [
        { label: 'Explain this page', answer: 'This page links out to VIKRAM\u2019s discovery tools \u2014 it doesn\u2019t compute anything itself.' },
        { label: 'What should I do next?', answer: 'Start with the Accumulation Scanner for verified evidence, or Hidden Gems for research-only candidates.', nav: 'scanner' }
      ]
    },
    academy: {
      title: 'VIKRAM Academy',
      description: 'Structured learning content \u2014 navigation is live, lesson content is not yet built.',
      suggestions: [
        { label: 'Explain this page', answer: 'NOT YET IMPLEMENTED \u2014 the Academy page exists but real lesson content hasn\u2019t been built yet. Nothing here is placeholder progress.' }
      ]
    },
    performanceLab: {
      title: 'Performance Lab',
      description: '1-Year Research is real; the recommendation archive and validation lab are not yet built.',
      suggestions: [
        { label: 'Explain this page', answer: 'The 1-Year Research section here is real and verified. The Recommendation Archive and Research & Validation Lab shown as not-yet-implemented are exactly that \u2014 not built yet, not simulated.', nav: 'research' }
      ]
    },
    marketIntelligence: {
      title: 'Market Intelligence',
      description: 'NOT YET IMPLEMENTED \u2014 sector/breadth/heatmap data VIKRAM does not currently have.',
      suggestions: [
        { label: 'Explain this page', answer: 'This page is a real, wired destination, but the sector leaderboard, rotation, and breadth content it would show require data VIKRAM doesn\u2019t ingest yet \u2014 honestly marked, not simulated.' }
      ]
    }
  };

  var DEFAULT_CONTEXT_KEY = 'home';

  // ------------------------------------------------------------------
  // 2. CONTEXT DETECTION
  //    Reads: <body data-vikram-page="..."> if present, otherwise the
  //    filename, refined by location.hash on the index.html SPA.
  // ------------------------------------------------------------------

  function detectContextKey() {
    var explicit = document.body && document.body.getAttribute('data-vikram-page');
    var hash = (window.location.hash || '').replace('#', '');
    var path = (window.location.pathname.split('/').pop() || 'index.html').toLowerCase();

    if (path === '' || path === 'index.html') {
      var hashMap = {
        scannerSurface: 'scanner',
        companyOverview: 'companyOverview',
        opportunityRadar: 'opportunityRadar',
        hiddenGems: 'hiddenGems',
        portfolio: 'portfolio',
        vikramLite: 'vikramLite',
        marketInsights: 'marketInsights',
        learningHub: 'learningHub',
        analytics: 'analytics',
        settings: 'settings'
      };
      if (hash && hashMap[hash]) return hashMap[hash];
      return explicit || DEFAULT_CONTEXT_KEY;
    }

    var fileMap = {
      'nse-data.html': 'nseData',
      'research.html': 'research',
      'scanner.html': 'scanner',
      'alerts.html': 'alerts',
      'about.html': 'about'
    };
    return explicit || fileMap[path] || DEFAULT_CONTEXT_KEY;
  }

  // Optional integration point: other VIKRAM scripts may set
  // window.VIKRAM_CONTEXT = { symbol: 'TCS', section: '...' } before or
  // after this script loads, to give the Guide a bit more to work with.
  // The Guide never requires this and degrades gracefully without it.
  function getExtraContext() {
    var ctx = window.VIKRAM_CONTEXT;
    if (ctx && typeof ctx === 'object') return ctx;
    return {};
  }

  // ------------------------------------------------------------------
  // 3. SUBSCRIPTION / ACCESS BOUNDARY
  //    VIKRAM's Subscription & Access Management system is planned but
  //    not implemented yet. This hook lets the Guide respect it once it
  //    exists, without the Guide implementing or bypassing it.
  // ------------------------------------------------------------------

  function isFeatureAllowed(featureKey) {
    var access = window.VikramAccess;
    if (access && typeof access.can === 'function') {
      try {
        return !!access.can(featureKey);
      } catch (e) {
        // If the access check itself fails, fail closed for that
        // feature rather than silently granting it.
        return false;
      }
    }
    // No access-control system installed yet — do not fabricate a
    // restriction that doesn't exist.
    return true;
  }

  // ------------------------------------------------------------------
  // 4. FREE-TEXT MATCHING (rule-based, no network call)
  //    INTEGRATION_BOUNDARY: a future real AI backend would replace the
  //    body of answerFreeText() with an authenticated call to VIKRAM's
  //    own server, which would in turn call the AI provider — never a
  //    provider secret placed in this client-side file.
  // ------------------------------------------------------------------

  var NAV_KEYWORDS = [
    { re: /accumulation|scanner/i, key: 'scanner' },
    { re: /hidden gem/i, key: 'hiddenGems' },
    { re: /opportunity radar|radar/i, key: 'opportunityRadar' },
    { re: /portfolio/i, key: 'portfolio' },
    { re: /nse data|coverage|gap/i, key: 'nseData' },
    { re: /research|backtest|success matrix/i, key: 'research' },
    { re: /alert/i, key: 'alerts' },
    { re: /company|analy[sz]e|score|verdict/i, key: 'companyOverview' },
    { re: /market insight|indices|index/i, key: 'marketInsights' },
    { re: /about/i, key: 'about' }
  ];

  var DATA_QUESTION_RE = /price|current score|exact|return|profit|loss|why did|% |percent|p\/e|pe ratio|target|prediction|forecast/i;

  function answerFreeText(raw, currentKey) {
    var text = (raw || '').trim();
    if (!text) return null;

    if (DATA_QUESTION_RE.test(text)) {
      return {
        text: 'DATA N/A \u2014 the Guide doesn\u2019t have a live connection to VIKRAM\u2019s market/score data, so it won\u2019t guess a number. Please check the figures directly on the page \u2014 they come straight from VIKRAM\u2019s own verified data.'
      };
    }

    for (var i = 0; i < NAV_KEYWORDS.length; i++) {
      if (NAV_KEYWORDS[i].re.test(text)) {
        var key = NAV_KEYWORDS[i].key;
        var ctx = CONTEXTS[key];
        if (!ctx) continue;
        if (!isFeatureAllowed(key)) {
          return { text: 'That feature isn\u2019t included in your current VIKRAM access. Ask your admin about upgrading, or explore the modules already available to you.' };
        }
        return {
          text: 'You\u2019re looking for ' + ctx.title + ': ' + ctx.description,
          nav: key
        };
      }
    }

    if (/what.*do.*here|don.?t know what to do|help/i.test(text)) {
      var here = CONTEXTS[currentKey] || CONTEXTS[DEFAULT_CONTEXT_KEY];
      return { text: here.description + ' Try one of the suggestions above, or tell me what you\u2019re trying to do.' };
    }

    return {
      text: 'I can help you navigate VIKRAM and explain what a page does, but I can\u2019t answer that from here. Try asking things like \u201cwhere do I find accumulation signals\u201d or \u201cwhat should I do next\u201d.'
    };
  }

  // ------------------------------------------------------------------
  // 5. STYLES (Aurora tokens only — no competing design system)
  // ------------------------------------------------------------------

  var STYLE_ID = 'vikram-guide-styles';
  if (!document.getElementById(STYLE_ID)) {
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = [
      '#vikramGuideLauncher{position:fixed;right:18px;bottom:18px;z-index:99990;',
      'display:inline-flex;align-items:center;gap:8px;padding:10px 16px;border-radius:999px;',
      'background:var(--accent-color,#3b82f6);color:#fff;border:none;cursor:pointer;',
      'font-family:var(--font-sans,Inter,sans-serif);font-weight:700;font-size:.85rem;',
      'box-shadow:var(--shadow-lg,0 8px 24px rgba(0,0,0,.4));transition:var(--transition-smooth,all .2s ease);}',
      '#vikramGuideLauncher:hover{background:var(--accent-hover,#2563eb);transform:translateY(-1px);}',
      '#vikramGuideLauncher:focus-visible{outline:3px solid #fff;outline-offset:2px;}',
      '#vikramGuideLauncher .vg-dot{width:8px;height:8px;border-radius:50%;background:#fff;opacity:.85;}',
      '#vikramGuidePanel{position:fixed;right:18px;bottom:80px;z-index:99991;width:340px;max-width:calc(100vw - 24px);',
      'max-height:min(560px,calc(100vh - 110px));display:none;flex-direction:column;overflow:hidden;',
      'background:var(--bg-card,#182038);border:1px solid var(--border-color,#2e3c63);border-radius:var(--radius-lg,12px);',
      'box-shadow:var(--shadow-lg,0 8px 24px rgba(0,0,0,.4));font-family:var(--font-sans,Inter,sans-serif);color:var(--text-primary,#f8fafc);}',
      '#vikramGuidePanel.vg-open{display:flex;}',
      '#vikramGuidePanel .vg-header{display:flex;align-items:flex-start;justify-content:space-between;gap:8px;',
      'padding:14px 14px 10px;border-bottom:1px solid var(--border-color,#2e3c63);}',
      '#vikramGuidePanel .vg-header h2{font-size:.95rem;margin:0 0 2px;}',
      '#vikramGuidePanel .vg-header p{margin:0;font-size:.75rem;color:var(--text-secondary,#94a3b8);}',
      '#vikramGuidePanel .vg-close{background:transparent;border:none;color:var(--text-secondary,#94a3b8);',
      'font-size:1.1rem;line-height:1;cursor:pointer;padding:4px;border-radius:6px;}',
      '#vikramGuidePanel .vg-close:hover{color:var(--text-primary,#f8fafc);background:var(--bg-input,#1e294b);}',
      '#vikramGuidePanel .vg-close:focus-visible{outline:2px solid var(--accent-color,#3b82f6);}',
      '#vikramGuidePanel .vg-body{flex:1;overflow-y:auto;padding:12px 14px;display:flex;flex-direction:column;gap:10px;}',
      '#vikramGuidePanel .vg-suggestions{display:flex;flex-wrap:wrap;gap:6px;}',
      '#vikramGuidePanel .vg-chip{background:var(--bg-input,#1e294b);border:1px solid var(--border-color,#2e3c63);',
      'color:var(--text-primary,#f8fafc);border-radius:999px;padding:6px 11px;font-size:.75rem;cursor:pointer;font-family:inherit;}',
      '#vikramGuidePanel .vg-chip:hover{border-color:var(--accent-color,#3b82f6);}',
      '#vikramGuidePanel .vg-chip:focus-visible{outline:2px solid var(--accent-color,#3b82f6);}',
      '#vikramGuidePanel .vg-msg{font-size:.82rem;line-height:1.4;background:var(--bg-input,#1e294b);',
      'border-radius:var(--radius-md,8px);padding:9px 11px;}',
      '#vikramGuidePanel .vg-msg.vg-user{background:var(--accent-color,#3b82f6);color:#fff;align-self:flex-end;}',
      '#vikramGuidePanel .vg-goto{display:inline-block;margin-top:6px;font-size:.75rem;font-weight:700;',
      'color:var(--accent-color,#3b82f6);text-decoration:none;}',
      '#vikramGuidePanel .vg-goto:hover{text-decoration:underline;}',
      '#vikramGuidePanel .vg-footer{border-top:1px solid var(--border-color,#2e3c63);padding:10px;display:flex;gap:8px;}',
      '#vikramGuidePanel .vg-input{flex:1;background:var(--bg-input,#1e294b);border:1px solid var(--border-color,#2e3c63);',
      'border-radius:var(--radius-md,8px);color:var(--text-primary,#f8fafc);padding:8px 10px;font:inherit;font-size:.82rem;}',
      '#vikramGuidePanel .vg-input:focus-visible{outline:2px solid var(--accent-color,#3b82f6);}',
      '#vikramGuidePanel .vg-send{background:var(--accent-color,#3b82f6);color:#fff;border:none;border-radius:var(--radius-md,8px);',
      'padding:0 14px;font-weight:700;cursor:pointer;font:inherit;font-size:.82rem;}',
      '#vikramGuidePanel .vg-send:hover{background:var(--accent-hover,#2563eb);}',
      '@media(max-width:480px){#vikramGuidePanel{right:12px;left:12px;width:auto;bottom:76px;}',
      '#vikramGuideLauncher{right:12px;bottom:12px;padding:9px 14px;font-size:.8rem;}}'
    ].join('');
    document.head.appendChild(style);
  }

  // ------------------------------------------------------------------
  // 6. DOM CONSTRUCTION
  // ------------------------------------------------------------------

  var launcher = document.createElement('button');
  launcher.id = 'vikramGuideLauncher';
  launcher.type = 'button';
  launcher.setAttribute('aria-haspopup', 'dialog');
  launcher.setAttribute('aria-expanded', 'false');
  launcher.setAttribute('aria-controls', 'vikramGuidePanel');
  launcher.innerHTML = '<span class="vg-dot" aria-hidden="true"></span><span>May I help you?</span>';

  var panel = document.createElement('div');
  panel.id = 'vikramGuidePanel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'false');
  panel.setAttribute('aria-labelledby', 'vikramGuideTitle');
  panel.innerHTML =
    '<div class="vg-header">' +
      '<div><h2 id="vikramGuideTitle">VIKRAM Guide</h2><p id="vikramGuideSubtitle"></p></div>' +
      '<button type="button" class="vg-close" aria-label="Close VIKRAM Guide">\u2715</button>' +
    '</div>' +
    '<div class="vg-body" id="vikramGuideBody" role="log" aria-live="polite"></div>' +
    '<div class="vg-footer">' +
      '<label for="vikramGuideInput" class="sr-only" style="position:absolute;width:1px;height:1px;overflow:hidden;">Ask the VIKRAM Guide a question</label>' +
      '<input type="text" id="vikramGuideInput" class="vg-input" placeholder="Ask a question\u2026" autocomplete="off">' +
      '<button type="button" class="vg-send">Send</button>' +
    '</div>';

  document.body.appendChild(launcher);
  document.body.appendChild(panel);

  var bodyEl = panel.querySelector('#vikramGuideBody');
  var subtitleEl = panel.querySelector('#vikramGuideSubtitle');
  var inputEl = panel.querySelector('#vikramGuideInput');
  var sendBtn = panel.querySelector('.vg-send');
  var closeBtn = panel.querySelector('.vg-close');

  var currentKey = detectContextKey();
  var isOpen = false;
  var lastFocused = null;

  function renderIntro() {
    bodyEl.innerHTML = '';
    var ctx = CONTEXTS[currentKey] || CONTEXTS[DEFAULT_CONTEXT_KEY];
    subtitleEl.textContent = ctx.title;

    var intro = document.createElement('div');
    intro.className = 'vg-msg';
    intro.textContent = ctx.description;
    bodyEl.appendChild(intro);

    var chips = document.createElement('div');
    chips.className = 'vg-suggestions';
    ctx.suggestions.forEach(function (s) {
      var chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'vg-chip';
      chip.textContent = s.label;
      chip.addEventListener('click', function () {
        addMessage(s.label, true);
        addMessage(s.answer, false, s.nav);
      });
      chips.appendChild(chip);
    });
    bodyEl.appendChild(chips);
  }

  function addMessage(text, isUser, navKey) {
    var msg = document.createElement('div');
    msg.className = 'vg-msg' + (isUser ? ' vg-user' : '');
    msg.textContent = text;
    if (!isUser && navKey && ROUTES[navKey] && isFeatureAllowed(navKey)) {
      var link = document.createElement('a');
      link.className = 'vg-goto';
      link.href = ROUTES[navKey];
      link.textContent = 'Go there \u2192';
      msg.appendChild(document.createElement('br'));
      msg.appendChild(link);
    }
    bodyEl.appendChild(msg);
    bodyEl.scrollTop = bodyEl.scrollHeight;
  }

  function openPanel() {
    isOpen = true;
    lastFocused = document.activeElement;
    currentKey = detectContextKey();
    renderIntro();
    panel.classList.add('vg-open');
    launcher.setAttribute('aria-expanded', 'true');
    document.addEventListener('keydown', onKeydown, true);
    // Focus the panel's first interactive control for screen-reader users.
    window.setTimeout(function () { closeBtn.focus(); }, 0);
  }

  function closePanel() {
    isOpen = false;
    panel.classList.remove('vg-open');
    launcher.setAttribute('aria-expanded', 'false');
    document.removeEventListener('keydown', onKeydown, true);
    if (lastFocused && typeof lastFocused.focus === 'function') {
      lastFocused.focus();
    } else {
      launcher.focus();
    }
  }

  function onKeydown(e) {
    if (e.key === 'Escape' || e.key === 'Esc') {
      e.preventDefault();
      closePanel();
      return;
    }
    // Simple focus trap while the panel is open.
    if (e.key === 'Tab') {
      var focusables = panel.querySelectorAll('button, input, a[href]');
      if (!focusables.length) return;
      var first = focusables[0];
      var last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }

  launcher.addEventListener('click', function () {
    if (isOpen) { closePanel(); } else { openPanel(); }
  });
  closeBtn.addEventListener('click', closePanel);

  function submitQuestion() {
    var val = inputEl.value;
    if (!val || !val.trim()) return;
    addMessage(val, true);
    inputEl.value = '';
    var result = answerFreeText(val, currentKey);
    if (result) addMessage(result.text, false, result.nav);
  }

  sendBtn.addEventListener('click', submitQuestion);
  inputEl.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      submitQuestion();
    }
  });

  // Keep context current on the index.html SPA as the user scrolls
  // between hash sections (no polling — event-driven only).
  window.addEventListener('hashchange', function () {
    currentKey = detectContextKey();
    if (isOpen) renderIntro();
  });

  // Silently note the extra-context hook exists without acting on it
  // yet; kept here so future integrations have a single documented
  // read site instead of scattering window.VIKRAM_CONTEXT reads.
  getExtraContext();
})();
