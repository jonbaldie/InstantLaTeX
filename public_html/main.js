const mathRendererModule = (typeof window !== 'undefined' && window.MathRenderer) ||
    (typeof module !== 'undefined' && module.exports ?
        require('./math-renderer.js') : null);

if (typeof window !== 'undefined') {
    (function(i,s,o,g,r,a,m){i['GoogleAnalyticsObject']=r;i[r]=i[r]||function(){
    (i[r].q=i[r].q||[]).push(arguments)},i[r].l=1*new Date();a=s.createElement(o),
    m=s.getElementsByTagName(o)[0];a.async=1;a.src=g;m.parentNode.insertBefore(a,m)
    })(window,document,'script','//www.google-analytics.com/analytics.js','ga');
    ga('create', 'UA-54119971-32', 'auto');
    ga('send', 'pageview');

    (function (w) {
        const mathRenderer = mathRendererModule.createMathRenderer();

        w.UpdateMath = function (TeX) {
            const node = document.querySelector("#math-output p");
            if (node) {
                mathRenderer.render(TeX, node);
            }
        }
    })(window);

    document.addEventListener("DOMContentLoaded", () => {
        const mathsEditor = document.getElementById("maths-editor");
        const initialEditorValue = mathsEditor.value;

        const getEncodedHash = () => window.location.hash ? window.location.hash.substring(1) : null;

        let debounceTimer;
        const updateFromHash = () => {
            clearTimeout(debounceTimer);
            try {
                const encodedHash = getEncodedHash();
                if (encodedHash === null) {
                    mathsEditor.value = initialEditorValue;
                } else if (encodedHash !== '') {
                    mathsEditor.value = decodeURIComponent(encodedHash);
                }
            } catch (err) {
                // Ignore malformed URL fragments and leave the current editor value intact.
            }
            UpdateMath(mathsEditor.value);
        };

        const updateHandler = () => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                UpdateMath(mathsEditor.value);
                let encodedHash;
                try {
                    encodedHash = `#${encodeURIComponent(mathsEditor.value)}`;
                } catch (err) {
                    // Skip the hash write when the value cannot be encoded,
                    // e.g. unpaired UTF-16 surrogates. The preview already updated.
                    return;
                }
                try {
                    if (window.history && typeof window.history.replaceState === 'function') {
                        window.history.replaceState(null, '', encodedHash);
                        return;
                    }
                } catch (err) {
                }

                try {
                    if (window.location && typeof window.location.replace === 'function') {
                        window.location.replace(encodedHash);
                    }
                } catch (err) {
                }
            }, 300);
        };

        const bracketPairModule = window.BracketPairController ||
            (typeof module !== 'undefined' && module.exports ?
                require('./bracket-pair-controller.js') : null);
        const bracketController = new bracketPairModule.BracketPairController();
        const textareaAdapter = new bracketPairModule.DomTextareaAdapter(mathsEditor, document);

        ['change', 'keyup', 'paste', 'mouseup', 'input'].forEach(evt => {
            mathsEditor.addEventListener(evt, updateHandler);
        });

        mathsEditor.addEventListener("keydown", function(e) {
            // The controller owns key decisions and mutations; the page owns
            // default-action cancellation and debounced preview/hash sync.
            const handled = bracketController.handleKeyDown(e, textareaAdapter);
            if (handled) {
                e.preventDefault();
                updateHandler();
            }
        });

        window.addEventListener("hashchange", updateFromHash);

        updateFromHash();

        document.querySelectorAll(".pre-made").forEach(btn => {
            btn.addEventListener("click", (e) => {
                e.preventDefault();
                const str = btn.getAttribute("data-math");
                const start = mathsEditor.selectionStart;
                const end = mathsEditor.selectionEnd;
                const val = mathsEditor.value;
                mathsEditor.value = val.slice(0, start) + str + val.slice(end);
                mathsEditor.selectionStart = mathsEditor.selectionEnd = start + str.length;
                mathsEditor.focus();
                UpdateMath(mathsEditor.value);
            });
        });

        // Tabs functionality
        const tabs = document.querySelectorAll(".math-tab");
        const panes = document.querySelectorAll(".tab-pane");

        tabs.forEach(tab => {
            tab.addEventListener("click", (e) => {
                e.preventDefault();
                // Remove active class from all tabs and panes
                tabs.forEach(t => t.classList.remove("active"));
                panes.forEach(p => p.classList.remove("active"));
                
                // Add active class to clicked tab and corresponding pane
                tab.classList.add("active");
                const targetId = tab.getAttribute("href").substring(1);
                const targetPane = document.getElementById(targetId);
                if (targetPane) {
                    targetPane.classList.add("active");
                }
            });
        });

    });

    window.addEventListener("load", () => {
        document.querySelectorAll("ins").forEach(ins => {
            if (ins.children.length === 0) {
                const parent = ins.parentNode;
                if (parent) {
                    const link = document.createElement("a");
                    link.rel = "nofollow";
                    link.target = "_blank";
                    link.href = "https://m.do.co/c/b3e7a275836a";
                    link.textContent = "Try DigitalOcean. Free $10 credit when you sign up";
                    parent.appendChild(link);
                }
            }
        });
    });
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { formatMath: mathRendererModule.formatMath };
}
