goog.provide('annotorious.modules.image.ImageAnnotator');

goog.require('goog.soy');
goog.require('goog.dom');
goog.require('goog.dom.classes');
goog.require('goog.dom.query');
goog.require('goog.events');
goog.require('goog.math');
goog.require('goog.style');

/**
 * The ImageAnnotator is responsible for handling annotation functionality
 * on one image in the page.
 * @param {element} image the image DOM element
 * @constructor
 */
annotorious.modules.image.ImageAnnotator = function(image, opt_popup, eventBroker) {
  var annotationLayer, viewCanvas, hint;

  /** The editor for this annotator (public for use by plugins) **/
  this.editor;

  /** The popup for this annotator (public for use by plugins) **/
  this.popup;

  /** @private **/
  this._image = image;
  
  /** @private **/
  this._eventBroker = eventBroker || new annotorious.events.EventBroker();

  /** @private **/
  this._selectors = [];
  
  /** @private **/
  this._currentSelector;

  /** @private **/
  this._selectionEnabled = true;

  var img_bounds = goog.style.getBounds(image);
  this.annotationLayer = annotationLayer = goog.dom.createDom('div', 'annotorious-annotationlayer');
  goog.style.setStyle(annotationLayer, 'position', 'relative');
  goog.style.setStyle(annotationLayer, 'display', 'inline-block');

  this._transferStyles(image, annotationLayer);

  goog.style.setSize(annotationLayer, img_bounds.width, img_bounds.height); 
  goog.dom.replaceNode(annotationLayer, image);
  goog.dom.appendChild(annotationLayer, image);
  
  viewCanvas = goog.soy.renderAsElement(annotorious.templates.image.canvas,
    { width:img_bounds.width, height:img_bounds.height });
  goog.dom.classes.add(viewCanvas, 'annotorious-item-unfocus');
  goog.dom.appendChild(annotationLayer, viewCanvas);   

  /** @private **/
  this._editCanvas = goog.soy.renderAsElement(annotorious.templates.image.canvas, 
    { width:img_bounds.width, height:img_bounds.height });
  goog.style.showElement(this._editCanvas, false); 
  goog.dom.appendChild(annotationLayer, this._editCanvas);  

  if (opt_popup)
    this.popup = opt_popup;
  else
    this.popup = new annotorious.viewer.Popup(annotationLayer, this);

  var default_selector = new annotorious.plugins.selection.RectDragSelector();
  default_selector.init(this._editCanvas, this); 
  this._selectors.push(default_selector);
  this._currentSelector = default_selector;

  /** @private **/
  this._viewer = new annotorious.modules.image.Viewer(viewCanvas, this.popup, this); 

  this.editor = new annotorious.editor.Editor(this, annotationLayer);

  /** @private **/
  this._hint = new annotorious.hint.Hint(this, annotationLayer);
  
  var self = this;  

  goog.events.listen(annotationLayer, goog.events.EventType.MOUSEOVER, function(event) {
    var relatedTarget = event.relatedTarget;
    if (!relatedTarget || !goog.dom.contains(annotationLayer, relatedTarget)) {
      self._eventBroker.fireEvent(annotorious.events.EventType.MOUSE_OVER_ANNOTATABLE_ITEM);
      goog.dom.classes.addRemove(viewCanvas, 'annotorious-item-unfocus', 'annotorious-item-focus');
    }
  });
  
  goog.events.listen(annotationLayer, goog.events.EventType.MOUSEOUT, function(event) {
    var relatedTarget = event.relatedTarget;
    if (!relatedTarget || !goog.dom.contains(annotationLayer, relatedTarget)) {
      self._eventBroker.fireEvent(annotorious.events.EventType.MOUSE_OUT_OF_ANNOTATABLE_ITEM);
      goog.dom.classes.addRemove(viewCanvas, 'annotorious-item-focus', 'annotorious-item-unfocus');
    }
  });

  goog.events.listen(viewCanvas, goog.events.EventType.MOUSEDOWN, function(event) {
    if (self._selectionEnabled) {
      goog.style.showElement(self._editCanvas, true);
      self._viewer.highlightAnnotation(undefined);
      self._currentSelector.startSelection(event.offsetX, event.offsetY);
    }
  });

  this._eventBroker.addHandler(annotorious.events.EventType.SELECTION_COMPLETED, function(event) {
    // var bounds = event.viewportBounds;
    // self.editor.setPosition({ x: bounds.left + self._image.offsetLeft,
    //                           y: bounds.bottom + 4 + self._image.offsetTop });
    // self.editor.open();
  });
  
  this._eventBroker.addHandler(annotorious.events.EventType.SELECTION_CANCELED, function() {
    goog.style.showElement(self._editCanvas, false);
    self._currentSelector.stopSelection();
  });
}

/**
 * Helper function to transfer relevant styles from the <img> to the annotation layer <div> element.
 * @private
 */
annotorious.modules.image.ImageAnnotator.prototype._transferStyles = function(image, annotationLayer) {
  var setReset = function(style, value) {
    goog.style.setStyle(annotationLayer, style, value); 
    goog.style.setStyle(image, style, 0);
  }

  var margin = goog.style.getMarginBox(image);
  if (margin.top != 0)
    setReset('margin-top', margin.top + 'px');

  if (margin.right != 0)
    setReset('margin-right', margin.right + 'px');

  if (margin.bottom != 0)
    setRest('margin-bottom', margin.bottom + 'px');
 
  if (margin.left != 0)
    setReset('margin-left', margin.left + 'px');

  var padding = goog.style.getPaddingBox(image);
  if (padding.top != 0)
    setReset('padding-top', padding.top + 'px');

  if (padding.right != 0)
    setReset('padding-right', padding.right + 'px');

  if (padding.bottom != 0)
    setRest('padding-bottom', padding.bottom + 'px');
 
  if (padding.left != 0)
    setReset('padding-left', padding.left + 'px');
}

/**
 * Standard Annotator method: edits the specified existing annotation.
 * @param {annotorious.annotation.Annotation} annotation the annotation
 */
annotorious.modules.image.ImageAnnotator.prototype.editAnnotation = function(annotation) {
  // Step 1 - remove from viewer
  this._viewer.removeAnnotation(annotation);
  
  // Step 2 - find a suitable selector for the shape
  var selector = goog.array.find(this._selectors, function(selector) {
    return selector.getSupportedShapeType() == annotation.shapes[0].type;
  });
  
  // Step 3 - open annotation in editor
  if (selector) {
    goog.style.showElement(this._editCanvas, true);
    this._viewer.highlightAnnotation(undefined);
    
    // TODO make editable - not just draw (selector implementation required)
    var g2d = this._editCanvas.getContext('2d');
    var shape = annotation.shapes[0];
    
    var self = this;
    var viewportShape = (shape.units == 'pixel') ? shape : annotorious.shape.transform(shape, function(xy) { return self.fromItemCoordinates(xy); }) ;
    selector.drawShape(g2d, viewportShape);
  }
  
  var bounds = annotorious.shape.getBoundingRect(annotation.shapes[0]).geometry;
  var anchor = (annotation.shapes[0].units == 'pixel') ?
    ({ x: bounds.x, y: bounds.y + bounds.height }) :
    this.fromItemCoordinates({ x: bounds.x, y: bounds.y + bounds.height });   
  
  this.editor.setPosition({ x: anchor.x + this._image.offsetLeft,
                            y: anchor.y + 4 + this._image.offsetTop });
  this.editor.open(annotation);  
}

/**
 * Standard Annotator method: adds annotation to this annotator's viewer.
 * @param {annotorious.annotation.Annotation} annotation the annotation
 * @param {Annotation} opt_replace optionally, an existing annotation to replace
 */
annotorious.modules.image.ImageAnnotator.prototype.addAnnotation = function(annotation, opt_replace) {
  this._viewer.addAnnotation(annotation, opt_replace);
}

/**
 * Standard Annotator method: adds a lifecycle event handler to this annotator's Event Broker.
 * @param {annotorious.events.EventType} type the event type
 * @param {function} the handler function
 */
annotorious.modules.image.ImageAnnotator.prototype.addHandler = function(type, handler) {
  this._eventBroker.addHandler(type, handler);  
}

/**
 * Standard Annotator method: adds a selector.
 * @param {object} selector the selector object 
 */
annotorious.modules.image.ImageAnnotator.prototype.addSelector = function(selector) {
  selector.init(this, this._editCanvas); 
  this._selectors.push(selector);
}

/**
 * Standard Annotator method: fire an event on this annotator's Event Broker.
 * @param {annotorious.events.EventType} type the event type
 * @param {object} the event object
 */
annotorious.modules.image.ImageAnnotator.prototype.fireEvent = function(type, event) {
  this._eventBroker.fireEvent(type, event);
}

/**
 * Standard Annotator method: converts the specified viewport coordinate to the
 * coordinate system used by the annotatable item.
 * @param {annotorious.shape.geom.Point} xy the viewport coordinate
 * @returns the corresponding item coordinate
 */
annotorious.modules.image.ImageAnnotator.prototype.fromItemCoordinates = function(xy) {
  // debugger
  // var imgSize = goog.style.getSize(this._image);
  var imgSize = {height: this._image.height, width: this._image.width}
  return { x: xy.x * imgSize.width, y: xy.y * imgSize.height };
}

/**
 * Standard Annotator method: returns the currently active selector.
 * @returns {object} the currently active selector
 */
annotorious.modules.image.ImageAnnotator.prototype.getActiveSelector = function() {
  return this._currentSelector;
}

/**
 * Standard Annotator method: returns all annotations on the annotatable media.
 * @returns {Array.<Annotation>} the annotations
 */
annotorious.modules.image.ImageAnnotator.prototype.getAnnotations = function() {
  return this._viewer.getAnnotations();
}

/**
 * Standard Annotator method: returns the available selectors for this item.
 * @returns {Array.<object>} the list of selectors
 */
annotorious.modules.image.ImageAnnotator.prototype.getAvailableSelectors = function() {
  return this._selectors;
}

/**
 * Standard Annotator method: returns the image that this annotator is responsible for.
 * @returns {element} the image
 */
annotorious.modules.image.ImageAnnotator.prototype.getItem = function() {
  // TODO include width and height
  return { src: annotorious.modules.image.ImageModule.getItemURL(this._image) };
}

/**
 * Standard Annotator method: highlights the specified annotation.
 * @param {Annotation} the annotation
 */
annotorious.modules.image.ImageAnnotator.prototype.highlightAnnotation = function(annotation) {
  this._viewer.highlightAnnotation(annotation);
}

/**
 * Standard Annotator method: removes an annotation from this annotator's viewer.
 * @param {annotorious.annotation.Annotation} annotation the annotation
 */
annotorious.modules.image.ImageAnnotator.prototype.removeAnnotation = function(annotation) {
  this._viewer.removeAnnotation(annotation);
}

/**
 * Standard Annotator method: removes a lifecycle event handler to this annotator's Event Broker.
 * @param {annotorious.events.EventType} type the event type
 * @param {function} the handler function
 */
annotorious.modules.image.ImageAnnotator.prototype.removeHandler = function(type, handler) {
  this._eventBroker.removeHandler(type, handler);
}

/**
 * Standard Annotator method: sets the active selector for this item to the specified selector.
 * @param {object} the selector object
 */
annotorious.modules.image.ImageAnnotator.prototype.setActiveSelector = function(selector) {
  this._currentSelector = goog.array.find(this._selectors, function(sel) {
    return sel.getName() == selector;
  });

  if (!this._currentSelector)
    console.log('WARNING: selector "' + selector + '" not available'); 
}

/**
 * Standard Annotator method: enables (or disables) the ability to create new annotations on the item
 * managed by this annotator.
 * @param {boolean} enabled if <code>true</code> new annotations can be created
 */
annotorious.modules.image.ImageAnnotator.prototype.setSelectionEnabled = function(enabled) {
  this._selectionEnabled = enabled;
  if (enabled) {
    // TODO if hint doesn't exist already, create
  } else {
    this._hint.destroy();
    delete this._hint;
  }
}

/**
 * Standard Annotator method: stops the selection (if any).
 */
annotorious.modules.image.ImageAnnotator.prototype.stopSelection = function(original_annotation) {
   goog.style.showElement(this._editCanvas, false);
   this._currentSelector.stopSelection();
   
   // If this was an edit of an annotation (rather than creation of a new one) re-add to viewer!
   if (original_annotation)
     this._viewer.addAnnotation(original_annotation);
}

/**
 * Standard Annotator method: converts the specified coordinate from the
 * coordinate system used by the annotatable item to viewport coordinates.
 * @param {annotorious.shape.geom.Point} xy the item coordinate
 * @returns the corresponding viewport coordinate
 */
annotorious.modules.image.ImageAnnotator.prototype.toItemCoordinates = function(xy) {
  var imgSize = goog.style.getSize(this._image);
  return { x: xy.x / imgSize.width, y: xy.y / imgSize.height };
}

annotorious.modules.image.ImageAnnotator.prototype['fireEvent'] = annotorious.modules.image.ImageAnnotator.prototype.fireEvent;
annotorious.modules.image.ImageAnnotator.prototype['toItemCoordinates'] = annotorious.modules.image.ImageAnnotator.prototype.toItemCoordinates;

