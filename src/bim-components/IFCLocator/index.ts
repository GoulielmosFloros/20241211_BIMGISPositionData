import * as OBC from "@thatopen/components";
//This is a data type used in maplibre for coordinates
// Is in the GeoJson standard so its Longitude, Latitude
import { LngLatLike } from "maplibre-gl";
import * as WEBIFC from "web-ifc";

// This interface will be used for the onMapRequested event
interface longlat {
  coords: number[];
  altitude: number;
}

export class IFCLocator extends OBC.Component {
  static readonly uuid = "6c49fd8b-8751-4995-9838-0563c055c8bf" as const;
  enabled = false;

	// This event is to trigger all the map logic in the main file
	// when the show map is clicked (See the next step for the UI)
  onMapRequested: OBC.Event<longlat>;

  constructor(components: OBC.Components) {
    super(components);

    components.add(IFCLocator.uuid, this);

    this.onMapRequested = new OBC.Event();
  }

	// This function will process the model's data to retrieve
	// the coordinates. Will return undefined if nothing is found.
  showModel = async (): Promise<LngLatLike | undefined> => {
	  // Use the fragments manager to go through each model
    const fragments = this.components.get(OBC.FragmentsManager);

		// For each model loaded into the scene
    for (const [_, model] of fragments.groups.entries()) {
	    // The coordinates are usually found in the properties of type IFCSITE
      const properties = await model.getAllPropertiesOfType(WEBIFC.IFCSITE);

      if (!properties) continue;

			// Multiple data can come so let's search through each
      for (const [_, data] of Object.entries(properties)) {
        if (!data) continue;
	
				// Retrieve the values of interest. If they are not contained
				// We look for the next one
        const { RefLatitude, RefLongitude, RefElevation } = data;

        if (!RefLatitude || !RefLongitude || !RefElevation) continue;

				// Use the function defined down below to convert the data
				// The information is usually found like (D, M, S, MS)
				// So we need to convert that to lat and long
        const latitude = this.convertDMStoDecimal(RefLatitude);
        const longitude = this.convertDMStoDecimal(RefLongitude);

				// Trigger the map logic
        this.onMapRequested.trigger({
          coords: [longitude, latitude],
          altitude: RefElevation.value,
        });
      }
    }

    return undefined;
  };

	// This function helps us convert the data from the IFCSite to something
	// readable by maplibre
  convertDMStoDecimal(dms: { value: number[] }): number {
    const [degrees, minutes, seconds, milliseconds] = dms.value;
    return degrees + minutes / 60 + (seconds + milliseconds / 1000000) / 3600;
  }
}

export * from "./src";