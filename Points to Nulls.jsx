﻿/**
 * Adds nulls to points of selected shape layers or masks.
 * This only works in AE 15.0 and higher!
 */
(function pointsToNulls () {
	var parentToSource = false, // Change this to true to parent the nulls to the layer instead of using toComp()
		comp = app.project.activeItem;

	if (parseInt(app.version) < 15.0) return;

	app.beginUndoGroup('addNullsToPoints');

	var layers = [];
	forAllSelectedLayersElseAll (comp, function(layer) { layers.push(layer); });

	forAllItemsInArray(layers, function (layer) {
		if (isShapeLayer(layer))
			createNullsAtShapeVertices(layer);
		else
			createNullsAtMaskVertices(layer);
	});

	app.endUndoGroup();

	/**
	 * Creates nulls for each point in each shape path on a given layer
	 *
	 * @param {Layer} layer
	 * @returns {Layer[]} Array of created nulls
	 */
	function createNullsAtShapeVertices (layer) {
		var shapeRoot = layer.property('ADBE Root Vectors Group'),
			createdNulls = [];

		recurseFindShapes(shapeRoot);

		return createdNulls;

		/**
		 * Recursively finds shape paths in a given group & creates nulls
		 *
		 * @param {PropertyGroup} shapeGrp Shape group to find paths in
		 */
		function recurseFindShapes (shapeGrp) {
			/**
			* Loops through each shape on the layer, and creates a null for each point in each shape path it finds
			*
			* @param {PropertyGroup} shapeGrp Shape property group to look in
			*/
			forAllPropsInGroup(shapeGrp, function (shapeItem, i) {
				if (shapeItem.matchName.indexOf('Group') > -1) {
					recurseFindShapes(shapeItem);
				} else if (shapeItem.matchName == 'ADBE Vector Shape') {
					var shapeNamePath = buildShapeNamePath(shapeItem),
						vertices = shapeItem.value.vertices;

					/**
					* For each vertex in the path:
					*	- Create a new null named appropriately
					*	- Set the label colour to the layer's label colour
					*	- Move it right above our layer
					*	- If 'parentToSource' is enabled, then set the layer as the null's parent
					*	- Set up the expression to link the null to the shape vertex
					*
					* @param {Point[]} vertices Array of vertices
					*/
					forAllItemsInArray(vertices, function (vertex, j) {
						var vertexNull = addNull(layer.containingComp);
							vertexNull.name = layer.name + ' : ' + shapeItem.propertyGroup(3).name + ' : ' + (j+1) + '/' + vertices.length;
							vertexNull.label = layer.label;
							vertexNull.moveBefore(layer);

						if (parentToSource)
							vertexNull.parent = layer;

						var vertexPos = vertexNull.property('ADBE Transform Group').property('ADBE Position');
							vertexPos.expression =
								'var layer = thisComp.layer("' + layer.name + '");\n' +
								shapeNamePath + '[' + j + ']' +
								(parentToSource ? '' : ')');

						createdNulls.push(vertexNull);
					});
				}
			});
		}

		/**
		 * Crawls hierarchy from end path, creating an expression path string
		 *
		 * @param {any} shapeItem
		 * @returns {String} Expression body text, crawling hierarchy
		 */
		function buildShapeNamePath (shapeItem) {
			var itemNames = ['.path'],
				parentGrp = shapeItem.propertyGroup(),
				ctr = 1,
				resultStr = "",
				offsetStr = "",
				i;

			while (parentGrp) {
				if (parentGrp.name !== 'Contents')
					itemNames.push('.content("' + parentGrp.name + '")');

				parentGrp = parentGrp.propertyGroup();
			}

			for (i = itemNames.length - 2; i >= 1; i--)
				resultStr += 'var grp' + ctr + ' = ' + 'grp' + (ctr++ -1) + itemNames[i] + ';\n';

			for (i = 1, il = ctr; i < il - 1; i++)
				offsetStr += 'grp' + i + '.transform.position - grp' + i + '.transform.anchorPoint + ';

			resultStr = resultStr.replace('grp0', 'layer');
			resultStr += parentToSource ? '' : 'layer.toComp(';
			resultStr += offsetStr + 'grp' + (ctr-1) + '.path.points()';

			return resultStr;
		}
	}

	/**
	 * Creates nulls for each point in each mask on a given layer
	 *
	 * @param {Layer} layer
	 * @returns {Layer[]} Array of created nulls
	 */
	function createNullsAtMaskVertices (layer) {
		var maskGrp = layer.property('ADBE Mask Parade'),
			createdNulls = [];

		/**
		* Loops through each mask on the layer, and creates a null for each point in each mask
		*
		* @param {PropertyGroup} maskGrp Mask property group to look in
		*/
		forAllPropsInGroup(maskGrp, function (mask) {
			var path = mask.property('ADBE Mask Shape'),
				vertices = path.value.vertices;

			/**
			* For each vertex in the path:
			*	- Create a new null named appropriately
			*	- Set the label colour to the layer's label colour
			*	- Move it right above our layer
			*	- If 'parentToSource' is enabled, then set the layer as the null's parent
			*	- Set up the expression to link the null to the mask vertex
			*
			* @param {Point[]} vertices Array of vertices
			*/
			forAllItemsInArray(vertices, function (vertex, i) {
				var vertexNull = addNull(layer.containingComp);
					vertexNull.name = layer.name + ' : ' + mask.name + ' : ' + (i+1) + '/' + vertices.length;
					vertexNull.label = layer.label;
					vertexNull.moveBefore(layer);

					if (parentToSource)
						vertexNull.parent = layer;

				var vertexPos = vertexNull.property('ADBE Transform Group').property('ADBE Position');
					vertexPos.expression =
						'var layer = thisComp.layer("' + layer.name + '");\n' +
						(parentToSource ? '' : 'layer.toComp(') +
						'layer.mask("' + mask.name + '").maskPath.points()[' + i + ']' +
						(parentToSource ? '' : ')');

				createdNulls.push(vertexNull);
			});
		});

		return createdNulls;
	}

	/**
	 * Creates a null in given comp
	 *
	 * @param {CompItem} comp Comp to add null to
	 * @returns {Layer} Newly-created null
	 */
	function addNull (comp) {
		return comp.layers.addNull();
	}

	/**
	 * Checks whether item is a comp
	 *
	 * @param {Item} item Project item to check
	 * @returns {Boolean} Whether the item is a comp
	 */
	function isComp (item) {
		return item instanceof CompItem;
	}

	/**
	 * Checks whether layer is a solid
	 *
	 * @param {Layer} layer Layer to check
	 * @returns {Boolean} Whether the layer is a Solid
	 */
	function isSolidLayer (layer) {
		if (!layer.source) return false;
		return layer.source.mainSource instanceof SolidSource;
	}

	/**
	 * Checks whether layer is a shape layer
	 *
	 * @param {Layer} layer Layer to check
	 * @returns {Boolean} Whether the layer is a shape layer
	 */
	function isShapeLayer (layer) {
		return layer.matchName == 'ADBE Vector Layer';
	}

	/**
	 * Returns active comp, or null if none
	 *
	 * @returns {CompItem} Active Comp
	 */
	 function getActiveComp () {
		var comp = app.project.activeItem;
		if (comp === null || !(isComp(comp))) {
			alert('Please select a composition!');
			return null;
		}
		return comp;
	}

	/**
	 * Iterates through all selected layers, or all layers if none selected
	 *
	 * @param {CompItem} comp Comp to iterate through
	 * @param {callback} func Callback function
	 * @param {{backwards: Boolean}} [options] Options object to recurse forward or backward
	 */
	function forAllSelectedLayersElseAll (comp, func, options) {
		if (comp.selectedLayers.length === 0)
			forAllLayersOfComp(comp, func, options);
		else
			forAllItemsInArray(comp.selectedLayers, func, options);
	}

	/**
	 * Iterates through array items
	 *
	 * @param {Array} array Array to iterate through
	 * @param {callback} func Callback function
	 * @param {{backwards: Boolean}} [options] Options object to recurse forward or backward
	 */
	function forAllItemsInArray (array, func, options) {
		var i, il;
		options = options || {};

		if (options.backwards === true)
			for (i = array.length - 1; i >= 0; i--)
				func(array[i], i);
		else
			for (i = 0, il = array.length; i < il; i++)
				func(array[i], i);
	}

	/**
	 * Iterates through property group properties
	 *
	 * @param {PropertyGroup} group Group to iterate through
	 * @param {callback} func Callback function
	 * @param {{backwards: Boolean}} [options] Options object to recurse forward or backward
	 */
	function forAllPropsInGroup (group, func, options) {
		var i, il;
		options = options || {};

		if (options.backwards === true)
			for (i = group.numProperties; i > 0; i--)
				func(group.property(i), i);
		else
			for (i = 1, il = group.numProperties; i <= il; i++)
				func(group.property(i), i);
	}

	/**
	 * Iterates through layers of a given comp
	 *
	 * @param {CompItem} comp Comp to iterate through
	 * @param {callback} func Callback function
	 * @param {{backwards: Boolean}} [options] Options object to recurse forward or backward
	 */
	function forAllLayersOfComp (comp, func, options) {
		var i, il;
		options = options || {};

		if (options.backwards === true)
			for (i = comp.layers.length - 1; i >= 0; i--)
				func(comp.layers[i], i);
		else
			for (i = 1, il = comp.layers.length; i <= il; i++)
				func(comp.layers[i], i);
	}
})();
