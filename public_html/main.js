function formatMath(TeX) {
    return (TeX && TeX !== "\\") ? "\\displaystyle{" + TeX + "}" : "";
}

if (typeof window !== 'undefined') {
    (function(i,s,o,g,r,a,m){i['GoogleAnalyticsObject']=r;i[r]=i[r]||function(){
    (i[r].q=i[r].q||[]).push(arguments)},i[r].l=1*new Date();a=s.createElement(o),
    m=s.getElementsByTagName(o)[0];a.async=1;a.src=g;m.parentNode.insertBefore(a,m)
    })(window,document,'script','//www.google-analytics.com/analytics.js','ga');
    ga('create', 'UA-54119971-32', 'auto');
    ga('send', 'pageview');

    (function (w) {
        let promise = Promise.resolve();

        w.UpdateMath = function (TeX) {
            const arg = formatMath(TeX);
            const node = document.querySelector("#math-output p");
            if (node) {
                promise = promise.then(() => {
                    node.textContent = "$$" + arg + "$$";
                    if (w.MathJax && typeof w.MathJax.typesetPromise === 'function') {
                        if (typeof w.MathJax.typesetClear === 'function') {
                            w.MathJax.typesetClear([node]);
                        }
                        return w.MathJax.typesetPromise([node]);
                    }
                    return Promise.resolve();
                }).catch(err => {
                    console.error(err);
                });
            }
        }
    })(window);

    document.addEventListener("DOMContentLoaded", () => {
        const mathsEditor = document.getElementById("maths-editor");

        const updateHandler = () => {
            UpdateMath(mathsEditor.value);
        };

        ['change', 'keyup', 'paste', 'mouseup'].forEach(evt => {
            mathsEditor.addEventListener(evt, updateHandler);
        });

        try {
            if (window.parent && window.parent.location.hash) {
                mathsEditor.value = decodeURIComponent(window.parent.location.hash.substr(1));
            } else if (window.location.hash) {
                mathsEditor.value = decodeURIComponent(window.location.hash.substr(1));
            }
        } catch (err) {
            if (window.location.hash) {
                mathsEditor.value = decodeURIComponent(window.location.hash.substr(1));
            }
        }

        const mathOutputP = document.querySelector("#math-output p");
        if (mathOutputP) {
            mathOutputP.textContent = "$$" + formatMath(mathsEditor.value) + "$$";
        }

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

        // Save page functionality
        const savePageBtn = document.getElementById("save-page");
        if (savePageBtn) {
            savePageBtn.addEventListener("click", (e) => {
                e.preventDefault();
                try {
                    if (window.parent) {
                        window.parent.location.hash = encodeURIComponent(mathsEditor.value);
                    } else {
                        window.location.hash = encodeURIComponent(mathsEditor.value);
                    }
                } catch (err) {
                    window.location.hash = encodeURIComponent(mathsEditor.value);
                }
                const originalText = savePageBtn.textContent;
                savePageBtn.textContent = "Saved!";
                setTimeout(() => {
                    savePageBtn.textContent = originalText;
                }, 2000);
            });
        }
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
