var md2rdfa = new (function () {

  var SDO = "http://schema.org/";

  var convertElement = this.convertElement = function (elem) {
    var addedVocab = false;
    // .. just iterating all, so vocab check expects one wrapping element
    for (var i=0, l=elem.getElementsByTagName('*'); i < l.length; i++) {
      var subel = l[i];
      if (replaceAttrs(subel, !addedVocab)) {
        addedVocab = true;
      }
    }
  };

  var replaceAttrs = this.replaceAttrs = function (elem, addVocab) {
    var prop = elem.getAttribute('itemprop');
    if (prop) {
      elem.setAttribute('property', prop);
      elem.removeAttribute('itemprop');
    }
    var id = elem.getAttribute('itemid');
    if (id) {
      elem.setAttribute('resource', id);
      elem.removeAttribute('itemid');
    }
    var addedVocab = false;
    var type = elem.getAttribute('itemtype');
    if (type) {
      if (type.indexOf(SDO) === 0) {
        type = type.substring(SDO.length);
        if (addVocab) {
          elem.setAttribute('vocab', SDO);
          addedVocab = true;
        }
      }
      elem.setAttribute('typeof', type);
      elem.removeAttribute('itemtype');
      elem.removeAttribute('itemscope');
    }
    // for readability, use attribute "order" to put the following after the above
    ['src', 'href', 'content'].forEach(function (name) {
      var value = elem.getAttribute(name);
      if (value) {
        elem.removeAttribute(name);
        elem.setAttribute(name, value);
      }
    });
    return addedVocab;
  }

  var convertText = this.convertText = function (raw) {
    var div = document.createElement('div');
    div.innerHTML = raw;
    convertElement(div);
    return div.innerHTML;
  };

  this.convertSdoMdExamplesToRdfa = function () {
    for (var i=0, l=document.getElementsByTagName('pre'); i < l.length; i++) {
      var el = l[i];
      var raw = el.innerText;
      if (typeof raw === 'undefined') { // innerText is non-standard
        raw = el.innerHTML.replace(/<br>/gi, "\n").replace(/(<([^>]+)>)/gi, "").replace(/\&lt;/g, "<").replace(/\&gt;/g, ">");
      }
      var converted = md2rdfa.convertText(raw);
      converted = converted.replace(/&nbsp;/g, ' ').replace(/\s+="" /g, ' ');
      if (typeof el.innerText !== 'undefined') {
        el.innerText = converted;
      } else {
        el.textContent = converted;
      }
    }
    if (typeof window.prettyPrint !== 'undefined') {
      window.prettyPrint();
      $(".atn:contains(vocab), .atn:contains(typeof), .atn:contains(property), .atn:contains(resource), .atn:contains(datetime), .tag:contains(time) ").addClass('new');
      //.atn:contains(href), .atn:contains(src), .atn:contains(content),
      $('.new + .pun + .atv').addClass('curl');
    }
  };

})();
