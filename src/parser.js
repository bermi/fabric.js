(function(global) {

  "use strict";

  /**
   * @name fabric
   * @namespace
   */

  var fabric = global.fabric || (global.fabric = { }),
      extend = fabric.util.object.extend,
      capitalize = fabric.util.string.capitalize,
      clone = fabric.util.object.clone,
      toFixed = fabric.util.toFixed,
      multiplyTransformMatrices = fabric.util.multiplyTransformMatrices;

  fabric.SHARED_ATTRIBUTES = [
    "transform",
    "fill", "fill-opacity", "fill-rule",
    "opacity",
    "stroke", "stroke-dasharray", "stroke-linecap", "stroke-linejoin", "stroke-miterlimit", "stroke-opacity", "stroke-width"
  ];

  var attributesMap = {
    'fill-opacity':     'fillOpacity',
    'fill-rule':        'fillRule',
    'font-family':      'fontFamily',
    'font-size':        'fontSize',
    'font-style':       'fontStyle',
    'font-weight':      'fontWeight',
    'cx':               'left',
    'x':                'left',
    'r':                'radius',
    'stroke-dasharray': 'strokeDashArray',
    'stroke-linecap':   'strokeLineCap',
    'stroke-linejoin':  'strokeLineJoin',
    'stroke-miterlimit':'strokeMiterLimit',
    'stroke-opacity':   'strokeOpacity',
    'stroke-width':     'strokeWidth',
    'text-decoration':  'textDecoration',
    'cy':               'top',
    'y':                'top',
    'transform':        'transformMatrix'
  };

  var colorAttributes = {
    'stroke': 'strokeOpacity',
    'fill':   'fillOpacity'
  };

  function normalizeAttr(attr) {
    // transform attribute names
    if (attr in attributesMap) {
      return attributesMap[attr];
    }
    return attr;
  }

  function normalizeValue(attr, value, parentAttributes) {
    var isArray;

    if ((attr === 'fill' || attr === 'stroke') && value === 'none') {
      value = '';
    }
    else if (attr === 'fillRule') {
      value = (value === 'evenodd') ? 'destination-over' : value;
    }
    else if (attr === 'strokeDashArray') {
      value = value.replace(/,/g, ' ').split(/\s+/);
    }
    else if (attr === 'transformMatrix') {
      if (parentAttributes && parentAttributes.transformMatrix) {
        value = multiplyTransformMatrices(
          parentAttributes.transformMatrix, fabric.parseTransformAttribute(value));
      }
      value = fabric.parseTransformAttribute(value);
    }

    isArray = Object.prototype.toString.call(value) === '[object Array]';

    // TODO: need to normalize em, %, pt, etc. to px (!)
    var parsed = isArray ? value.map(parseFloat) : parseFloat(value);

    return (!isArray && isNaN(parsed) ? value : parsed);
  }

  /**
   * @private
   * @param {Object} attributes Array of attributes to parse
   */
  function _setStrokeFillOpacity(attributes) {
    for (var attr in colorAttributes) {
      if (!attributes[attr] || typeof attributes[colorAttributes[attr]] === 'undefined') continue;

      var color = new fabric.Color(attributes[attr]);
      attributes[attr] = color.setAlpha(toFixed(color.getAlpha() * attributes[colorAttributes[attr]], 2)).toRgba();

      delete attributes[colorAttributes[attr]];
    }
    return attributes;
  }

  /**
   * Returns an object of attributes' name/value, given element and an array of attribute names;
   * Parses parent "g" nodes recursively upwards.
   * @static
   * @memberOf fabric
   * @param {DOMElement} element Element to parse
   * @param {Array} attributes Array of attributes to parse
   * @return {Object} object containing parsed attributes' names/values
   */
  function parseAttributes(element, attributes) {

    if (!element) {
      return;
    }

    var value,
        parentAttributes = { };

    // if there's a parent container (`g` node), parse its attributes recursively upwards
    if (element.parentNode && /^g$/i.test(element.parentNode.nodeName)) {
      parentAttributes = fabric.parseAttributes(element.parentNode, attributes);
    }

    var ownAttributes = attributes.reduce(function(memo, attr) {
      value = element.getAttribute(attr);
      if (value) {
        attr = normalizeAttr(attr);
        value = normalizeValue(attr, value, parentAttributes);

        memo[attr] = value;
      }
      return memo;
    }, { });

    // add values parsed from style, which take precedence over attributes
    // (see: http://www.w3.org/TR/SVG/styling.html#UsingPresentationAttributes)

    ownAttributes = extend(ownAttributes,
      extend(getGlobalStylesForElement(element), fabric.parseStyleAttribute(element)));
    return _setStrokeFillOpacity(extend(parentAttributes, ownAttributes));
  }

  /**
   * Parses "transform" attribute, returning an array of values
   * @static
   * @function
   * @memberOf fabric
   * @param attributeValue {String} string containing attribute value
   * @return {Array} array of 6 elements representing transformation matrix
   */
  fabric.parseTransformAttribute = (function() {
    function rotateMatrix(matrix, args) {
      var angle = args[0];

      matrix[0] = Math.cos(angle);
      matrix[1] = Math.sin(angle);
      matrix[2] = -Math.sin(angle);
      matrix[3] = Math.cos(angle);
    }

    function scaleMatrix(matrix, args) {
      var multiplierX = args[0],
          multiplierY = (args.length === 2) ? args[1] : args[0];

      matrix[0] = multiplierX;
      matrix[3] = multiplierY;
    }

    function skewXMatrix(matrix, args) {
      matrix[2] = args[0];
    }

    function skewYMatrix(matrix, args) {
      matrix[1] = args[0];
    }

    function translateMatrix(matrix, args) {
      matrix[4] = args[0];
      if (args.length === 2) {
        matrix[5] = args[1];
      }
    }

    // identity matrix
    var iMatrix = [
          1, // a
          0, // b
          0, // c
          1, // d
          0, // e
          0  // f
        ],

        // == begin transform regexp
        number = '(?:[-+]?\\d+(?:\\.\\d+)?(?:e[-+]?\\d+)?)',
        comma_wsp = '(?:\\s+,?\\s*|,\\s*)',

        skewX = '(?:(skewX)\\s*\\(\\s*(' + number + ')\\s*\\))',
        skewY = '(?:(skewY)\\s*\\(\\s*(' + number + ')\\s*\\))',
        rotate = '(?:(rotate)\\s*\\(\\s*(' + number + ')(?:' + comma_wsp + '(' + number + ')' + comma_wsp + '(' + number + '))?\\s*\\))',
        scale = '(?:(scale)\\s*\\(\\s*(' + number + ')(?:' + comma_wsp + '(' + number + '))?\\s*\\))',
        translate = '(?:(translate)\\s*\\(\\s*(' + number + ')(?:' + comma_wsp + '(' + number + '))?\\s*\\))',

        matrix = '(?:(matrix)\\s*\\(\\s*' +
                  '(' + number + ')' + comma_wsp +
                  '(' + number + ')' + comma_wsp +
                  '(' + number + ')' + comma_wsp +
                  '(' + number + ')' + comma_wsp +
                  '(' + number + ')' + comma_wsp +
                  '(' + number + ')' +
                  '\\s*\\))',

        transform = '(?:' +
                    matrix + '|' +
                    translate + '|' +
                    scale + '|' +
                    rotate + '|' +
                    skewX + '|' +
                    skewY +
                    ')',

        transforms = '(?:' + transform + '(?:' + comma_wsp + transform + ')*' + ')',

        transform_list = '^\\s*(?:' + transforms + '?)\\s*$',

        // http://www.w3.org/TR/SVG/coords.html#TransformAttribute
        reTransformList = new RegExp(transform_list),
        // == end transform regexp

        reTransform = new RegExp(transform, 'g');

    return function(attributeValue) {

      // start with identity matrix
      var matrix = iMatrix.concat();
      var matrices = [ ];

      // return if no argument was given or
      // an argument does not match transform attribute regexp
      if (!attributeValue || (attributeValue && !reTransformList.test(attributeValue))) {
        return matrix;
      }

      attributeValue.replace(reTransform, function(match) {

        var m = new RegExp(transform).exec(match).filter(function (match) {
              return (match !== '' && match != null);
            }),
            operation = m[1],
            args = m.slice(2).map(parseFloat);

        switch(operation) {
          case 'translate':
            translateMatrix(matrix, args);
            break;
          case 'rotate':
            rotateMatrix(matrix, args);
            break;
          case 'scale':
            scaleMatrix(matrix, args);
            break;
          case 'skewX':
            skewXMatrix(matrix, args);
            break;
          case 'skewY':
            skewYMatrix(matrix, args);
            break;
          case 'matrix':
            matrix = args;
            break;
        }

        // snapshot current matrix into matrices array
        matrices.push(matrix.concat());
        // reset
        matrix = iMatrix.concat();
      });

      var combinedMatrix = matrices[0];
      while (matrices.length > 1) {
        matrices.shift();
        combinedMatrix = fabric.util.multiplyTransformMatrices(combinedMatrix, matrices[0]);
      }
      return combinedMatrix;
    };
  })();

  /**
   * Parses "points" attribute, returning an array of values
   * @static
   * @memberOf fabric
   * @param points {String} points attribute string
   * @return {Array} array of points
   */
  function parsePointsAttribute(points) {

    // points attribute is required and must not be empty
    if (!points) return null;

    points = points.trim();
    var asPairs = points.indexOf(',') > -1;

    points = points.split(/\s+/);
    var parsedPoints = [ ], i, len;

    // points could look like "10,20 30,40" or "10 20 30 40"
    if (asPairs) {
      i = 0;
      len = points.length;
      for (; i < len; i++) {
        var pair = points[i].split(',');
        parsedPoints.push({ x: parseFloat(pair[0]), y: parseFloat(pair[1]) });
      }
    }
    else {
      i = 0;
      len = points.length;
      for (; i < len; i+=2) {
        parsedPoints.push({ x: parseFloat(points[i]), y: parseFloat(points[i+1]) });
      }
    }

    // odd number of points is an error
    if (parsedPoints.length % 2 !== 0) {
      // return null;
    }

    return parsedPoints;
  }

  function parseFontDeclaration(value, oStyle) {

    // TODO: support non-px font size
    var match = value.match(/(normal|italic)?\s*(normal|small-caps)?\s*(normal|bold|bolder|lighter|100|200|300|400|500|600|700|800|900)?\s*(\d+)px\s+(.*)/);

    if (!match) return;

    var fontStyle = match[1];
    // Font variant is not used
    // var fontVariant = match[2];
    var fontWeight = match[3];
    var fontSize = match[4];
    var fontFamily = match[5];

    if (fontStyle) {
      oStyle.fontStyle = fontStyle;
    }
    if (fontWeight) {
      oStyle.fontSize = isNaN(parseFloat(fontWeight)) ? fontWeight : parseFloat(fontWeight);
    }
    if (fontSize) {
      oStyle.fontSize = parseFloat(fontSize);
    }
    if (fontFamily) {
      oStyle.fontFamily = fontFamily;
    }
  }

  /**
   * Parses "style" attribute, retuning an object with values
   * @static
   * @memberOf fabric
   * @param {SVGElement} element Element to parse
   * @return {Object} Objects with values parsed from style attribute of an element
   */
  function parseStyleAttribute(element) {
    var oStyle = { },
        style = element.getAttribute('style'),
        attr, value;

    if (!style) return oStyle;

    if (typeof style === 'string') {
      style.replace(/;$/, '').split(';').forEach(function (chunk) {
        var pair = chunk.split(':');

        attr = normalizeAttr(pair[0].trim().toLowerCase());
        value = normalizeValue(attr, pair[1].trim());

        if (attr === 'font') {
          parseFontDeclaration(value, oStyle);
        }
        else {
          oStyle[attr] = value;
        }
      });
    }
    else {
      for (var prop in style) {
        if (typeof style[prop] === 'undefined') continue;

        attr = normalizeAttr(prop.toLowerCase());
        value = normalizeValue(attr, style[prop]);

        if (attr === 'font') {
          parseFontDeclaration(value, oStyle);
        }
        else {
          oStyle[attr] = value;
        }
      }
    }

    return oStyle;
  }

  function resolveGradients(instances) {
    for (var i = instances.length; i--; ) {
      var instanceFillValue = instances[i].get('fill');

      if (/^url\(/.test(instanceFillValue)) {

        var gradientId = instanceFillValue.slice(5, instanceFillValue.length - 1);

        if (fabric.gradientDefs[gradientId]) {
          instances[i].set('fill',
            fabric.Gradient.fromElement(fabric.gradientDefs[gradientId], instances[i]));
        }
      }
    }
  }

  /**
   * Transforms an array of svg elements to corresponding fabric.* instances
   * @static
   * @memberOf fabric
   * @param {Array} elements Array of elements to parse
   * @param {Function} callback Being passed an array of fabric instances (transformed from SVG elements)
   * @param {Object} [options] Options object
   * @param {Function} [reviver] Method for further parsing of SVG elements, called after each fabric object created.
   */
  function parseElements(elements, callback, options, reviver) {
    var instances = new Array(elements.length), i = elements.length;

    function checkIfDone() {
      if (--i === 0) {
        instances = instances.filter(function(el) {
          return el != null;
        });
        resolveGradients(instances);
        callback(instances);
      }
    }

    for (var index = 0, el, len = elements.length; index < len; index++) {
      el = elements[index];
      var klass = fabric[capitalize(el.tagName)];
      if (klass && klass.fromElement) {
        try {
          if (klass.async) {
            klass.fromElement(el, (function(index, el) {
              return function(obj) {
                reviver && reviver(el, obj);
                instances.splice(index, 0, obj);
                checkIfDone();
              };
            })(index, el), options);
          }
          else {
            var obj = klass.fromElement(el, options);
            reviver && reviver(el, obj);
            instances.splice(index, 0, obj);
            checkIfDone();
          }
        }
        catch(err) {
          fabric.log(err);
        }
      }
      else {
        checkIfDone();
      }
    }
  }

  /**
   * Returns CSS rules for a given SVG document
   * @static
   * @function
   * @memberOf fabric
   * @param {SVGDocument} doc SVG document to parse
   * @return {Object} CSS rules of this document
   */
  function getCSSRules(doc) {
    var styles = doc.getElementsByTagName('style'),
        allRules = { },
        rules;

    // very crude parsing of style contents
    for (var i = 0, len = styles.length; i < len; i++) {
      var styleContents = styles[0].textContent;

      // remove comments
      styleContents = styleContents.replace(/\/\*[\s\S]*?\*\//g, '');

      rules = styleContents.match(/[^{]*\{[\s\S]*?\}/g);
      rules = rules.map(function(rule) { return rule.trim(); });

      rules.forEach(function(rule) {
        var match = rule.match(/([\s\S]*?)\s*\{([^}]*)\}/);
        rule = match[1];
        var declaration = match[2].trim(),
            propertyValuePairs = declaration.replace(/;$/, '').split(/\s*;\s*/);

        if (!allRules[rule]) {
          allRules[rule] = { };
        }

        for (var i = 0, len = propertyValuePairs.length; i < len; i++) {
          var pair = propertyValuePairs[i].split(/\s*:\s*/),
              property = pair[0],
              value = pair[1];

          allRules[rule][property] = value;
        }
      });
    }

    return allRules;
  }

  /**
   * @private
   */
  function getGlobalStylesForElement(element) {
    var nodeName = element.nodeName,
        className = element.getAttribute('class'),
        id = element.getAttribute('id'),
        styles = { };

    for (var rule in fabric.cssRules) {
      var ruleMatchesElement = (className && new RegExp('^\\.' + className).test(rule)) ||
                               (id && new RegExp('^#' + id).test(rule)) ||
                               (new RegExp('^' + nodeName).test(rule));

      if (ruleMatchesElement) {
        for (var property in fabric.cssRules[rule]) {
          styles[property] = fabric.cssRules[rule][property];
        }
      }
    }

    return styles;
  }

  /**
   * Parses an SVG document, converts it to an array of corresponding fabric.* instances and passes them to a callback
   * @static
   * @function
   * @memberOf fabric
   * @param {SVGDocument} doc SVG document to parse
   * @param {Function} callback Callback to call when parsing is finished; It's being passed an array of elements (parsed from a document).
   * @param {Function} [reviver] Method for further parsing of SVG elements, called after each fabric object created.
   */
  fabric.parseSVGDocument = (function() {

    var reAllowedSVGTagNames = /^(path|circle|polygon|polyline|ellipse|rect|line|image|text)$/;

    // http://www.w3.org/TR/SVG/coords.html#ViewBoxAttribute
    // \d doesn't quite cut it (as we need to match an actual float number)

    // matches, e.g.: +14.56e-12, etc.
    var reNum = '(?:[-+]?\\d+(?:\\.\\d+)?(?:e[-+]?\\d+)?)';

    var reViewBoxAttrValue = new RegExp(
      '^' +
      '\\s*(' + reNum + '+)\\s*,?' +
      '\\s*(' + reNum + '+)\\s*,?' +
      '\\s*(' + reNum + '+)\\s*,?' +
      '\\s*(' + reNum + '+)\\s*' +
      '$'
    );

    function hasAncestorWithNodeName(element, nodeName) {
      while (element && (element = element.parentNode)) {
        if (nodeName.test(element.nodeName)) {
          return true;
        }
      }
      return false;
    }

    return function(doc, callback, reviver) {
      if (!doc) return;

      var startTime = new Date(),
          descendants = fabric.util.toArray(doc.getElementsByTagName('*'));

      if (descendants.length === 0) {
        // we're likely in node, where "o3-xml" library fails to gEBTN("*")
        // https://github.com/ajaxorg/node-o3-xml/issues/21
        descendants = doc.selectNodes("//*[name(.)!='svg']");
        var arr = [ ];
        for (var i = 0, len = descendants.length; i < len; i++) {
          arr[i] = descendants[i];
        }
        descendants = arr;
      }

      var elements = descendants.filter(function(el) {
        return reAllowedSVGTagNames.test(el.tagName) &&
              !hasAncestorWithNodeName(el, /^(?:pattern|defs)$/); // http://www.w3.org/TR/SVG/struct.html#DefsElement
      });

      if (!elements || (elements && !elements.length)) return;

      var viewBoxAttr = doc.getAttribute('viewBox'),
          widthAttr = doc.getAttribute('width'),
          heightAttr = doc.getAttribute('height'),
          width = null,
          height = null,
          minX,
          minY;

      if (viewBoxAttr && (viewBoxAttr = viewBoxAttr.match(reViewBoxAttrValue))) {
        minX = parseInt(viewBoxAttr[1], 10);
        minY = parseInt(viewBoxAttr[2], 10);
        width = parseInt(viewBoxAttr[3], 10);
        height = parseInt(viewBoxAttr[4], 10);
      }

      // values of width/height attributes overwrite those extracted from viewbox attribute
      width = widthAttr ? parseFloat(widthAttr) : width;
      height = heightAttr ? parseFloat(heightAttr) : height;

      var options = {
        width: width,
        height: height
      };

      fabric.gradientDefs = fabric.getGradientDefs(doc);
      fabric.cssRules = getCSSRules(doc);

      // Precedence of rules:   style > class > attribute

      fabric.parseElements(elements, function(instances) {
        fabric.documentParsingTime = new Date() - startTime;
        if (callback) {
          callback(instances, options);
        }
      }, clone(options), reviver);
    };
  })();

   /**
    * Used for caching SVG documents (loaded via `fabric.Canvas#loadSVGFromURL`)
    * @namespace
    */
   var svgCache = {

     /**
      * @param {String} name
      * @param {Function} callback
      */
     has: function (name, callback) {
       callback(false);
     },

     /**
      * @param {String} url
      * @param {Function} callback
      */
     get: function () {
       /* NOOP */
     },

     /**
      * @param {String} url
      * @param {Object} object
      */
     set: function () {
       /* NOOP */
     }
   };

   /**
    * Takes url corresponding to an SVG document, and parses it into a set of fabric objects. Note that SVG is fetched via XMLHttpRequest, so it needs to conform to SOP (Same Origin Policy)
    * @memberof fabric
    * @param {String} url
    * @param {Function} callback
    * @param {Function} [reviver] Method for further parsing of SVG elements, called after each fabric object created.
    */
   function loadSVGFromURL(url, callback, reviver) {

     url = url.replace(/^\n\s*/, '').trim();

     svgCache.has(url, function (hasUrl) {
       if (hasUrl) {
         svgCache.get(url, function (value) {
           var enlivedRecord = _enlivenCachedObject(value);
           callback(enlivedRecord.objects, enlivedRecord.options);
         });
       }
       else {
         new fabric.util.request(url, {
           method: 'get',
           onComplete: onComplete
         });
       }
     });

     function onComplete(r) {

       var xml = r.responseXML;
       if (!xml.documentElement && fabric.window.ActiveXObject && r.responseText) {
         xml = new ActiveXObject('Microsoft.XMLDOM');
         xml.async = 'false';
         //IE chokes on DOCTYPE
         xml.loadXML(r.responseText.replace(/<!DOCTYPE[\s\S]*?(\[[\s\S]*\])*?>/i,''));
       }
       if (!xml.documentElement) return;

       fabric.parseSVGDocument(xml.documentElement, function (results, options) {
         svgCache.set(url, {
           objects: fabric.util.array.invoke(results, 'toObject'),
           options: options
         });
         callback(results, options);
       }, reviver);
     }
   }

  /**
   * @private
   */
  function _enlivenCachedObject(cachedObject) {

   var objects = cachedObject.objects,
       options = cachedObject.options;

   objects = objects.map(function (o) {
     return fabric[capitalize(o.type)].fromObject(o);
   });

   return ({ objects: objects, options: options });
  }

  /**
    * Takes string corresponding to an SVG document, and parses it into a set of fabric objects
    * @memberof fabric
    * @param {String} string
    * @param {Function} callback
    * @param {Function} [reviver] Method for further parsing of SVG elements, called after each fabric object created.
    */
  function loadSVGFromString(string, callback, reviver) {
    string = string.trim();
    var doc;
    if (typeof DOMParser !== 'undefined') {
      var parser = new DOMParser();
      if (parser && parser.parseFromString) {
        doc = parser.parseFromString(string, 'text/xml');
      }
    }
    else if (fabric.window.ActiveXObject) {
      doc = new ActiveXObject('Microsoft.XMLDOM');
      doc.async = 'false';
      //IE chokes on DOCTYPE
      doc.loadXML(string.replace(/<!DOCTYPE[\s\S]*?(\[[\s\S]*\])*?>/i,''));
    }

    fabric.parseSVGDocument(doc.documentElement, function (results, options) {
      callback(results, options);
    }, reviver);
  }

  /**
   * Creates markup containing SVG font faces
   * @param {Array} objects Array of fabric objects
   * @return {String}
   */
  function createSVGFontFacesMarkup(objects) {
    var markup = '';

    for (var i = 0, len = objects.length; i < len; i++) {
      if (objects[i].type !== 'text' || !objects[i].path) continue;

      markup += [
        '@font-face {',
          'font-family: ', objects[i].fontFamily, '; ',
          'src: url(\'', objects[i].path, '\')',
        '}'
      ].join('');
    }

    if (markup) {
      markup = [
        '<style type="text/css">',
          '<![CDATA[',
            markup,
          ']]>',
        '</style>'
      ].join('');
    }

    return markup;
  }

  /**
   * Creates markup containing SVG referenced elements like patterns, gradients etc.
   * @param {fabric.Canvas} canvas instance of fabric.Canvas
   * @return {String}
   */
  function createSVGRefElementsMarkup(canvas) {
    var markup = '';

    if (canvas.backgroundColor && canvas.backgroundColor.source) {
      markup = [
        '<pattern x="0" y="0" id="backgroundColorPattern" ',
          'width="', canvas.backgroundColor.source.width,
          '" height="', canvas.backgroundColor.source.height,
          '" patternUnits="userSpaceOnUse">',
        '<image x="0" y="0" ',
        'width="', canvas.backgroundColor.source.width,
        '" height="', canvas.backgroundColor.source.height,
        '" xlink:href="', canvas.backgroundColor.source.src,
        '"></image></pattern>'
      ].join('');
    }

    return markup;
  }

  extend(fabric, {

    parseAttributes:            parseAttributes,
    parseElements:              parseElements,
    parseStyleAttribute:        parseStyleAttribute,
    parsePointsAttribute:       parsePointsAttribute,
    getCSSRules:                getCSSRules,

    loadSVGFromURL:             loadSVGFromURL,
    loadSVGFromString:          loadSVGFromString,

    createSVGFontFacesMarkup:   createSVGFontFacesMarkup,
    createSVGRefElementsMarkup: createSVGRefElementsMarkup
  });

})(typeof exports !== 'undefined' ? exports : this);
