function formatMath(TeX) {
    return (TeX && TeX !== "\\") ? TeX : "";
}

if (typeof window !== 'undefined') {
    (function(i,s,o,g,r,a,m){i['GoogleAnalyticsObject']=r;i[r]=i[r]||function(){
    (i[r].q=i[r].q||[]).push(arguments)},i[r].l=1*new Date();a=s.createElement(o),
    m=s.getElementsByTagName(o)[0];a.async=1;a.src=g;m.parentNode.insertBefore(a,m)
    })(window,document,'script','//www.google-analytics.com/analytics.js','ga');
    ga('create', 'UA-54119971-32', 'auto');
    ga('send', 'pageview');

    (function (w) {
        w.UpdateMath = function (TeX) {
            const arg = formatMath(TeX);
            const node = document.querySelector("#math-output p");
            if (node) {
                if (typeof katex !== 'undefined') {
                    katex.render(arg, node, {
                        throwOnError: false,
                        displayMode: true
                    });
                } else {
                    node.textContent = "$$" + arg + "$$";
                }
            }
        }
    })(window);

    document.addEventListener("DOMContentLoaded", () => {
        const mathsEditor = document.getElementById("maths-editor");
        const initialEditorValue = mathsEditor.value;

        const getUrlTarget = () => {
            try {
                if (window.parent && window.parent.location) {
                    return window.parent;
                }
            } catch (err) {
                // Fall back to the current window when the parent is inaccessible.
            }
            return window;
        };

        const getEncodedHash = () => {
            const urlTarget = getUrlTarget();

            try {
                if (urlTarget.location.hash) {
                    return urlTarget.location.hash.substring(1);
                }
            } catch (err) {
                // Fall back to the current window when the target hash is inaccessible.
            }

            try {
                if (window.location.hash) {
                    return window.location.hash.substring(1);
                }
            } catch (err) {
                // Ignore inaccessible URL state.
            }

            return null;
        };

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
                const urlTarget = getUrlTarget();

                try {
                    if (urlTarget.history && typeof urlTarget.history.replaceState === 'function') {
                        urlTarget.history.replaceState(null, '', encodedHash);
                        return;
                    }
                } catch (err) {
                    // Fall back to replacing the URL when the History API is unavailable.
                }

                try {
                    if (urlTarget.location && typeof urlTarget.location.replace === 'function') {
                        urlTarget.location.replace(encodedHash);
                    }
                } catch (err) {
                    // Ignore inaccessible URL state.
                }
            }, 300);
        };

        ['change', 'keyup', 'paste', 'mouseup', 'input'].forEach(evt => {
            mathsEditor.addEventListener(evt, updateHandler);
        });

        mathsEditor.addEventListener("keydown", function(e) {
            const pairs = {
                '(': ')',
                '[': ']',
                '{': '}'
            };
            if (pairs[e.key]) {
                e.preventDefault();
                const start = this.selectionStart;
                const end = this.selectionEnd;
                const val = this.value;
                const selectedText = val.substring(start, end);
                const insertStr = e.key + selectedText + pairs[e.key];
                
                this.value = val.substring(0, start) + insertStr + val.substring(end);
                
                if (start === end) {
                    this.selectionStart = this.selectionEnd = start + 1;
                } else {
                    this.selectionStart = start + 1;
                    this.selectionEnd = end + 1;
                }
                
                updateHandler();
            }
        });

        const hashChangeTarget = getUrlTarget();
        try {
            if (hashChangeTarget && typeof hashChangeTarget.addEventListener === 'function') {
                hashChangeTarget.addEventListener("hashchange", updateFromHash);
            } else {
                window.addEventListener("hashchange", updateFromHash);
            }
        } catch (err) {
            window.addEventListener("hashchange", updateFromHash);
        }

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
    module.exports = { formatMath };
}
