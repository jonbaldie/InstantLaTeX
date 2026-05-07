function formatMath(TeX) {
    return (TeX && TeX != "\\") ? "\\displaystyle{" + TeX + "}" : "";
}

if (typeof window !== 'undefined') {
    (function(i,s,o,g,r,a,m){i['GoogleAnalyticsObject']=r;i[r]=i[r]||function(){
    (i[r].q=i[r].q||[]).push(arguments)},i[r].l=1*new Date();a=s.createElement(o),
    m=s.getElementsByTagName(o)[0];a.async=1;a.src=g;m.parentNode.insertBefore(a,m)
    })(window,document,'script','//www.google-analytics.com/analytics.js','ga');
    ga('create', 'UA-54119971-32', 'auto');
    ga('send', 'pageview');

    (function (w) {
        var promise = Promise.resolve();

        w.UpdateMath = function (TeX) {
            var arg = formatMath(TeX);
            var node = document.querySelector("#math-output p");
            if (node) {
                promise = promise.then(function() {
                    node.textContent = "$$" + arg + "$$";
                    if (w.MathJax && typeof w.MathJax.typesetPromise === 'function') {
                        if (typeof w.MathJax.typesetClear === 'function') {
                            w.MathJax.typesetClear([node]);
                        }
                        return w.MathJax.typesetPromise([node]);
                    }
                    return Promise.resolve();
                }).catch(function(err) {
                    console.error(err);
                });
            }
        }
    })(window);

    // Using let/const or window bindings properly might be nice, but to match exactly and avoid breaking:
    var $maths = $("#maths-editor");

    $maths.on("change keyup paste mouseup", function () {
        UpdateMath($(this).val());
    });

    if (parent.location.hash) {
        $maths.val(decodeURIComponent(parent.location.hash.substr(1)));
    }

    $("#math-output p").text("$$" + formatMath($maths.val()) + "$$");

    $(".pre-made").click(function (e) {
        e.preventDefault();
        var $str = $(this).data("math");
        $maths.val($maths.val() + $str);
        UpdateMath($maths.val());
    });

    $(".math-tab:first").tab("show");

    $(".math-tab").click(function (e) {
        e.preventDefault();
        $(this).tab("show");
    })

    $("#save-page").click(function (e) {
        e.preventDefault();
        parent.location.hash = encodeURIComponent($maths.val());
    });

    var $ins = $("ins");

    $(window).on("load", function (e) {
        $ins.children().length || $ins.parent().append('<a rel="nofollow" target="_blank" href="https://m.do.co/c/b3e7a275836a">Try DigitalOcean. Free $10 credit when you sign up</a>');
    });
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { formatMath };
}
