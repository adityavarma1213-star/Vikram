/*
==========================================================
VIKRAM Investor Operating System
File : js/gauge.js
Version : Alpha 1.3
Author : Lead Frontend Engineer / Chief Architect
Status : Complete & Production Ready
==========================================================
*/

/**
 * Reusable independent SVG gauge visualization component.
 * Handles rendering, color mapping, and structural performance animations
 * for quantitative investor scoring metrics without external package dependencies.
 */
const gaugeEngine = {
    /**
     * Determines the hex configuration color using explicit quantitative boundary tiers.
     * @param {number} score - Computed metric score evaluated between 0 and 100.
     * @returns {string} Hexadecimal color value string match.
     */
    getColorByScore: function(score) {
        if (score >= 90) return "#10b981"; // Green (Strong Buy)
        if (score >= 75) return "#3b82f6"; // Blue (Buy)
        if (score >= 60) return "#eab308"; // Yellow (Hold)
        if (score >= 40) return "#f97316"; // Orange (Reduce)
        return "#ef4444";                 // Red (Avoid)
    },

    /**
     * Generates and mounts an animated circular SVG vector chart gauge inside a specified root container node.
     * @param {HTMLElement} container - Target DOM node anchor element to host the UI gauge.
     * @param {Object} options - Visualization factor parameters package configurations.
     * @param {number} options.score - Metric scalar score out of 100 points.
     * @param {string} options.rating - Qualitative textual recommendation directive tier.
     * @param {string} options.stars - Unicode representation string mapping evaluation weight tiers.
     * @param {number} options.confidence - Analytical data configuration integrity metric percentage.
     * @param {number} [options.size=220] - Width and height bounding pixel diameters of the root SVG element.
     * @param {number} [options.strokeWidth=16] - SVG circle line ring execution width.
     * @param {boolean} [options.animate=true] - Command control flag instructing hardware layout animation sequencing interpolations.
     */
    render: function(container, options) {
        if (!container) return;

        // Configuration fallbacks processing setup
        const score = Math.max(0, Math.min(100, options.score ?? 0));
        const rating = options.rating ?? "—";
        const stars = options.stars ?? "—";
        const confidence = Math.max(0, Math.min(100, options.confidence ?? 0));
        
        const size = options.size ?? 220;
        const strokeWidth = options.strokeWidth ?? 16;
        const animate = options.animate ?? true;

        // Layout coordinate computation configurations
        const center = size / 2;
        const radius = center - (strokeWidth / 2) - 4;
        const circumference = 2 * Math.PI * radius;
        const activeColor = this.getColorByScore(score);

        // Wipe internal container contents clean
        container.innerHTML = "";

        // Construct programmatic vector layout
        const svgNamespace = "http://www.w3.org/2000/svg";
        const svg = document.createElementNS(svgNamespace, "svg");
        svg.setAttribute("width", size.toString());
        svg.setAttribute("height", size.toString());
        svg.style.display = "block";
        svg.style.margin = "0 auto";
        svg.style.overflow = "visible";

        // Render Background Tracking Ring Pipeline Node
        const bgCircle = document.createElementNS(svgNamespace, "circle");
        bgCircle.setAttribute("cx", center.toString());
        bgCircle.setAttribute("cy", center.toString());
        bgCircle.setAttribute("r", radius.toString());
        bgCircle.setAttribute("fill", "none");
        bgCircle.setAttribute("stroke", "rgba(255, 255, 255, 0.05)");
        bgCircle.setAttribute("stroke-width", strokeWidth.toString());
        svg.appendChild(bgCircle);

        // Render Active Color Vector Progress Indicator Ring Segment
        const fgCircle = document.createElementNS(svgNamespace, "circle");
        fgCircle.setAttribute("cx", center.toString());
        fgCircle.setAttribute("cy", center.toString());
        fgCircle.setAttribute("r", radius.toString());
        fgCircle.setAttribute("fill", "none");
        fgCircle.setAttribute("stroke", activeColor);
        fgCircle.setAttribute("stroke-width", strokeWidth.toString());
        fgCircle.setAttribute("stroke-linecap", "round");
        // Center rotation transform to point gauge initial stroke execution angle directly up
        fgCircle.setAttribute("transform", `rotate(-90 ${center} ${center})`);
        fgCircle.setAttribute("stroke-dasharray", circumference.toString());

        // Initialize animation parameters configuration state maps
        if (animate) {
            fgCircle.setAttribute("stroke-dashoffset", circumference.toString());
        } else {
            const staticOffset = circumference - (score / 100) * circumference;
            fgCircle.setAttribute("stroke-dashoffset", staticOffset.toString());
        }
        svg.appendChild(fgCircle);

        // Initialize Central DOM Text Node Structural Block Components Group Container
        const contentGroup = document.createElementNS(svgNamespace, "g");
        contentGroup.setAttribute("text-anchor", "middle");

        // Primary Numeric Display Layout Sub-nodes
        const scoreText = document.createElementNS(svgNamespace, "text");
        scoreText.setAttribute("x", center.toString());
        scoreText.setAttribute("y", (center - 10).toString());
        scoreText.setAttribute("fill", "#ffffff");
        scoreText.setAttribute("font-size", `${Math.round(size * 0.22)}px`);
        scoreText.setAttribute("font-weight", "800");
        scoreText.setAttribute("font-family", "system-ui, -apple-system, BlinkMacSystemFont, sans-serif");
        scoreText.textContent = "0"; // Initial fallback framework state for text processing ticks

        const maxScaleSpan = document.createElementNS(svgNamespace, "tspan");
        maxScaleSpan.setAttribute("font-size", `${Math.round(size * 0.09)}px`);
        maxScaleSpan.setAttribute("font-weight", "400");
        maxScaleSpan.setAttribute("fill", "rgba(255,255,255,0.4)");
        maxScaleSpan.textContent = " /100";
        scoreText.appendChild(maxScaleSpan);
        contentGroup.appendChild(scoreText);

        // Unicode Star Grid Allocation Mapping Display Sub-nodes
        const starsText = document.createElementNS(svgNamespace, "text");
        starsText.setAttribute("x", center.toString());
        starsText.setAttribute("y", (center + 18).toString());
        starsText.setAttribute("fill", "#eab308");
        starsText.setAttribute("font-size", `${Math.round(size * 0.085)}px`);
        starsText.setAttribute("font-family", "system-ui, -apple-system, BlinkMacSystemFont, sans-serif");
        starsText.textContent = stars;
        contentGroup.appendChild(starsText);

        // Strategic Alpha Tier Directives Tracking Sub-nodes
        const ratingText = document.createElementNS(svgNamespace, "text");
        ratingText.setAttribute("x", center.toString());
        ratingText.setAttribute("y", (center + 40).toString());
        ratingText.setAttribute("fill", activeColor);
        ratingText.setAttribute("font-size", `${Math.round(size * 0.075)}px`);
        ratingText.setAttribute("font-weight", "700");
        ratingText.setAttribute("letter-spacing", "1px");
        ratingText.setAttribute("font-family", "system-ui, -apple-system, BlinkMacSystemFont, sans-serif");
        ratingText.textContent = rating;
        contentGroup.appendChild(ratingText);

        // Reliability Data Metrics Confidence Margin Component Nodes
        const confidenceText = document.createElementNS(svgNamespace, "text");
        confidenceText.setAttribute("x", center.toString());
        confidenceText.setAttribute("y", (center + 62).toString());
        confidenceText.setAttribute("fill", "rgba(255, 255, 255, 0.4)");
        confidenceText.setAttribute("font-size", `${Math.round(size * 0.055)}px`);
        confidenceText.setAttribute("font-weight", "500");
        confidenceText.setAttribute("font-family", "system-ui, -apple-system, BlinkMacSystemFont, sans-serif");
        confidenceText.textContent = `Confidence ${confidence}%`;
        contentGroup.appendChild(confidenceText);

        svg.appendChild(contentGroup);
        container.appendChild(svg);

        // Execute precise timeline animation frames tracking pipeline manually
        if (animate) {
            const duration = 1000; // Duration limit set to 1000ms
            const startTime = performance.now();

            const stepAnimation = (currentTime) => {
                const elapsedTime = currentTime - startTime;
                const progress = Math.min(elapsedTime / duration, 1);
                
                // Exponential cubic easing logic applied over normalized timelines
                const easedProgress = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);

                // Line offset interpolations calculations
                const currentScore = easedProgress * score;
                const currentOffset = circumference - (currentScore / 100) * circumference;
                fgCircle.setAttribute("stroke-dashoffset", currentOffset.toString());

                // Value counter updates tracking parameters processing loop 
                scoreText.firstChild.textContent = Math.round(currentScore).toString();

                if (progress < 1) {
                    requestAnimationFrame(stepAnimation);
                } else {
                    scoreText.firstChild.textContent = score.toString();
                    fgCircle.setAttribute("stroke-dashoffset", (circumference - (score / 100) * circumference).toString());
                }
            };
            requestAnimationFrame(stepAnimation);
        } else {
            scoreText.firstChild.textContent = score.toString();
        }
    }
};

// Freeze visual rendering pipeline configurations schema parameters explicitly at runtime boundary channels
Object.freeze(gaugeEngine);

// Export gauge graphics component module into standard global application pipeline scopes
window.VIKRAM_GAUGE_ENGINE = gaugeEngine;