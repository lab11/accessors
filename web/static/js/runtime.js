
/*
Functions that accessors can use. Based on a very basic version of
javascript.
*/



/* Parse an HTML document for an element with the given ID, and then return
 * the value of that element. Only works in very simple cases where there
 * not nested elements or crazy spaces.
 */
function getElementValueById (html, id) {
	var start_index = 0;
	var id_index = 0;

	while (true) {
		id_index = html.indexOf(id, start_index);

		if ((id_index - start_index) < 4) {
			// If -1, then it wasn't found. If < 4, there isn't room for
			// the 'id="' part.
			return null;
		}
		var part_check = html.substring(id_index, id_index-4);
		if (part_check == 'id="') {
			// At this point we're going to say we found the correct element.
			break;
		} else {
			// Must've been something else. Keep searching.
			start_index = id_index;
		}
	}

	// Find the next ">" marking the end of the element identifier and
	// start of the value.
	var val_index_beg = html.indexOf(">", id_index) + 1;
	var val_index_end = html.indexOf("<", val_index_beg);

	return html.substring(val_index_beg, val_index_end);
}

function getXMLValue (xml, element) {
	var first = xml.indexOf(element);
	var second = xml.indexOf(element, first+1);
	return xml.substring(first+element.length+1, second-2);
}