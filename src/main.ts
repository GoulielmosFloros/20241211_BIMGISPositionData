import * as THREE from "three";
import * as OBC from "@thatopen/components";
import * as OBF from "@thatopen/components-front";
import * as BUI from "@thatopen/ui";
import maplibregl, { LngLatLike, CustomLayerInterface } from "maplibre-gl";
import projectInformation from "./components/Panels/ProjectInformation";
import elementData from "./components/Panels/Selection";
import settings from "./components/Panels/Settings";
import load from "./components/Toolbars/Sections/Import";
import help from "./components/Panels/Help";
import camera from "./components/Toolbars/Sections/Camera";
import measurement from "./components/Toolbars/Sections/Measurement";
import selection from "./components/Toolbars/Sections/Selection";
import { AppManager, IFCLocator, IFCLocatorUI } from "./bim-components";

BUI.Manager.init();

const components = new OBC.Components();
const worlds = components.get(OBC.Worlds);

const world = worlds.create<
  OBC.SimpleScene,
  OBC.OrthoPerspectiveCamera,
  OBF.PostproductionRenderer
>();
world.name = "Main";

world.scene = new OBC.SimpleScene(components);
world.scene.setup();
world.scene.three.background = null;

const viewport = BUI.Component.create<BUI.Viewport>(() => {
  return BUI.html`
    <bim-viewport>
      <bim-grid floating></bim-grid>
    </bim-viewport>
  `;
});

world.renderer = new OBF.PostproductionRenderer(components, viewport);
const { postproduction } = world.renderer;

world.camera = new OBC.OrthoPerspectiveCamera(components);

const worldGrid = components.get(OBC.Grids).create(world);
worldGrid.material.uniforms.uColor.value = new THREE.Color(0x424242);
worldGrid.material.uniforms.uSize1.value = 2;
worldGrid.material.uniforms.uSize2.value = 8;

const resizeWorld = () => {
  world.renderer?.resize();
  world.camera.updateAspect();
};

viewport.addEventListener("resize", resizeWorld);

components.init();

postproduction.enabled = true;
postproduction.customEffects.excludedMeshes.push(worldGrid.three);
postproduction.setPasses({ custom: true, ao: true, gamma: true });
postproduction.customEffects.lineColor = 0x17191c;

const appManager = components.get(AppManager);
const viewportGrid = viewport.querySelector<BUI.Grid>("bim-grid[floating]")!;
appManager.grids.set("viewport", viewportGrid);

const fragments = components.get(OBC.FragmentsManager);
const indexer = components.get(OBC.IfcRelationsIndexer);
const classifier = components.get(OBC.Classifier);
classifier.list.CustomSelections = {};

const ifcLoader = components.get(OBC.IfcLoader);
await ifcLoader.setup();

const tilesLoader = components.get(OBF.IfcStreamer);
tilesLoader.world = world;
tilesLoader.culler.threshold = 10;
tilesLoader.culler.maxHiddenTime = 1000;
tilesLoader.culler.maxLostTime = 40000;

const highlighter = components.get(OBF.Highlighter);
highlighter.setup({ world });
highlighter.zoomToSelection = true;

const culler = components.get(OBC.Cullers).create(world);
culler.threshold = 5;

world.camera.controls.restThreshold = 0.25;
world.camera.controls.addEventListener("rest", () => {
  culler.needsUpdate = true;
  tilesLoader.cancel = true;
  tilesLoader.culler.needsUpdate = true;
});

fragments.onFragmentsLoaded.add(async (model) => {
  if (model.hasProperties) {
    await indexer.process(model);
    classifier.byEntity(model);
  }

  if (!model.isStreamed) {
    for (const fragment of model.items) {
      world.meshes.add(fragment.mesh);
      culler.add(fragment.mesh);
    }
  }

  world.scene.three.add(model);

  if (!model.isStreamed) {
    setTimeout(async () => {
      world.camera.fit(world.meshes, 0.8);
    }, 50);
  }
});

fragments.onFragmentsDisposed.add(({ fragmentIDs }) => {
  for (const fragmentID of fragmentIDs) {
    const mesh = [...world.meshes].find((mesh) => mesh.uuid === fragmentID);
    if (mesh) {
      world.meshes.delete(mesh);
    }
  }
});

const ifclocator = components.get(IFCLocator)
const projectInformationPanel = projectInformation(components);
const elementDataPanel = elementData(components);

const toolbar = BUI.Component.create(() => {
  return BUI.html`
    <bim-tabs floating style="justify-self: center; border-radius: 0.5rem;">
      <bim-tab label="Import">
        <bim-toolbar>
          ${load(components)}
        </bim-toolbar>
      </bim-tab>
      <bim-tab label="Selection">
        <bim-toolbar>
          ${camera(world)}
          ${selection(components, world)}
        </bim-toolbar>
      </bim-tab>
      <bim-tab label="Measurement">
        <bim-toolbar>
            ${measurement(world, components)}
        </bim-toolbar>      
      </bim-tab>
      <bim-tab label="Maps">
        <bim-toolbar>
          ${IFCLocatorUI(components)} 
        </bim-toolbar> 
      </bim-tab> 
    </bim-tabs>
  `;
});

const leftPanel = BUI.Component.create(() => {
  return BUI.html`
    <bim-tabs switchers-full>
      <bim-tab name="project" label="Project" icon="ph:building-fill">
        ${projectInformationPanel}
      </bim-tab>
      <bim-tab name="settings" label="Settings" icon="solar:settings-bold">
        ${settings(components)}
      </bim-tab>
      <bim-tab name="help" label="Help" icon="material-symbols:help">
        ${help}
      </bim-tab>
    </bim-tabs> 
  `;
});

// Get the map element, it will be used in the maplibregl to create the instance
const map = document.getElementById("map") as HTMLDivElement;
const app = document.getElementById("app") as BUI.Grid;
app.layouts = {
  main: {
    template: `
      "leftPanel viewport" 1fr
      /26rem 1fr
    `,
    elements: {
      leftPanel,
      viewport,
    },
  },
  map: {
    template: `
    "map"
    `,
    elements: {
      map,
    },
  },
};

app.layout = "main";

viewportGrid.layouts = {
  main: {
    template: `
      "empty" 1fr
      "toolbar" auto
      /1fr
    `,
    elements: { toolbar },
  },
  second: {
    template: `
      "empty elementDataPanel" 1fr
      "toolbar elementDataPanel" auto
      /1fr 24rem
    `,
    elements: {
      toolbar,
      elementDataPanel,
    },
  },
};

viewportGrid.layout = "main";

// Adding the logic to the trigger
ifclocator.onMapRequested.add((data) => {
	// If not disabled, the grid will appear on the map, looks ugly
	worldGrid.visible = false;
	// Show the map instead of the viewport
  app.layout = "map";

	// Instantiate the map object
  const maplibre = new maplibregl.Map({
    container: "map", // container id
    style:
      "https://api.maptiler.com/maps/openstreetmap/style.json?key=bNj34ZiztD9jASNubRqO",
    center: data.coords as LngLatLike,
    zoom: 18,
    pitch: 45,
    bearing: -17.6,
  });

	// This popups will display useful information later
	// when looking at the marker
  const popup = new maplibregl.Popup({
    closeButton: false,
    closeOnClick: false,
  });

	// We are going to use a new renderer
	// But the scene is going to be the same to keep the loaded model
  const layerRenderer = new THREE.WebGLRenderer({
    canvas: maplibre.getCanvas(),
    context: maplibre.getCanvas().getContext("webgl") as WebGLRenderingContext,
    antialias: true,
    alpha: true,
  });

  function loadModel(coords: LngLatLike) {
	  // This might vary depending on your model
    const modelRotate = [Math.PI / 2, 1, 0];

		// Maplibre expects mercator coordinates
    const modelAsMercatorCoordinate = maplibregl.MercatorCoordinate.fromLngLat(
      coords,
      data.altitude,
    );

		// We have to remove the layer before adding it again with the new data
    if (maplibre.getLayer("3dmodel")) {
      maplibre.removeLayer("3dmodel");
    }

    // transformation parameters to position, rotate and scale the 3D model onto the map
    const modelTransform = {
      translateX: modelAsMercatorCoordinate.x,
      translateY: modelAsMercatorCoordinate.y,
      translateZ: modelAsMercatorCoordinate.z,
      rotateX: modelRotate[0],
      rotateY: modelRotate[1],
      rotateZ: modelRotate[2],
      /* Since our 3D model is in real world meters, a scale transform needs to be
       * applied since the CustomLayerInterface expects units in MercatorCoordinates.
       */
      scale: modelAsMercatorCoordinate.meterInMercatorCoordinateUnits(),
    };

    const layerCamera = new THREE.Camera();

		// This is the same logic that we used before.
    const customLayer: CustomLayerInterface = {
      id: "3dmodel",
      type: "custom",
      renderingMode: "3d",
      async onAdd() {
        layerRenderer.autoClear = false;
      },
      render(_, matrix) {
        const rotationX = new THREE.Matrix4().makeRotationAxis(
          new THREE.Vector3(1, 0, 0),
          modelTransform.rotateX,
        );
        const rotationY = new THREE.Matrix4().makeRotationAxis(
          new THREE.Vector3(0, 1, 0),
          modelTransform.rotateY,
        );
        const rotationZ = new THREE.Matrix4().makeRotationAxis(
          new THREE.Vector3(0, 0, 1),
          modelTransform.rotateZ,
        );

        const m = new THREE.Matrix4().fromArray(matrix);
        const l = new THREE.Matrix4()
          .makeTranslation(
            modelTransform.translateX,
            modelTransform.translateY,
            modelTransform.translateZ,
          )
          .scale(
            new THREE.Vector3(
              modelTransform.scale,
              -modelTransform.scale,
              modelTransform.scale,
            ),
          )
          .multiply(rotationX)
          .multiply(rotationY)
          .multiply(rotationZ);

        layerCamera.projectionMatrix = m.multiply(l);
        layerRenderer.resetState();
        layerRenderer.render(world.scene.three, layerCamera);
        maplibre.triggerRepaint();
      },
    };

		// This only works when the style gets loaded
    maplibre.on("style.load", () => {
      maplibre.addLayer(customLayer);
    });

		// So we implement a second verification for when we reposition the model
		// Else, the layer won't be reloaded.
    const isLoaded = maplibre.isStyleLoaded();
    if (isLoaded) {
      maplibre.addLayer(customLayer);
    }
  }

	// This is another function that will be executed multiple times
	// Because the marker must be repositioned too
  async function setMarker(coords: number[]) {
	  // Get the layer so we can remove it.
    const loadedLayer = maplibre.getLayer("places");

		// If in fact the layer was added, remove it along with the source and image.
    if (loadedLayer) {
      maplibre.removeLayer("places");
      maplibre.removeSource("places");
      maplibre.removeImage("custom-marker");
    }

    const image = await maplibre.loadImage(
      "https://maplibre.org/maplibre-gl-js/docs/assets/custom_marker.png",
    );

    maplibre.addImage("custom-marker", image.data);

    maplibre.addSource("places", {
      type: "geojson",
      data: {
        type: "Feature",
        properties: {
          description: "<strong>Click to modify Model's coordinates</strong>",
        },
        geometry: {
          type: "Point",
          coordinates: coords as number[],
        },
      },
    });

		// Remember that the image and the source are tied by the layer.
		// And the ids must match.
    maplibre.addLayer({
      id: "places",
      type: "symbol",
      source: "places",
      layout: {
        "icon-image": "custom-marker",
        "icon-overlap": "always",
      },
    });
  }

	// Now set the event for when the map gets loaded.
  maplibre.on("load", async () => {
    setMarker(data.coords);

		// This bool will dynamically handle the
		// reposition mode and appearance of the popup
    let holdPopup = false;

		// Event for when the mouse is hovered over the marker
    maplibre.on("mouseenter", "places", (e) => {
      maplibre.getCanvas().style.cursor = "pointer";
      if (!(e.features && "properties" in e.features[0])) return;
      const properties = e.features[0].properties as { description: string };
      const description = properties.description;

			// The bool it's still false
			// When true it's because we are in reposition mode.
			// So this check avoids this popup appearing when in repoisiton mode
      if (!holdPopup) {
        popup
          .setLngLat(e.lngLat)
          .setHTML(description as string)
          .addTo(maplibre);
      }
    });
    
    // Event for when we click on the marker
    maplibre.on("click", "places", (e) => {
      maplibre.getCanvas().style.cursor = "crosshair";
      const description =
        "<strong>Double click on the map to set new coordinates</strong>";
        
      // Now we will put a different info on the popup
      popup.setLngLat(e.lngLat).setHTML(description).addTo(maplibre);

			// Now that the bool is true, the other events will behave differently.
      holdPopup = true;

			// We have limited events.
			// The last event is with double click
			// So we disable this to avoid the map zooming in when we double click
			// on a new part of the map while in reposition mode
      maplibre.doubleClickZoom.disable();
    });

		// When the bool is false, the mouse leaving the marker will make
		// The popup disappear.
    maplibre.on("mouseleave", "places", () => {
      if (!holdPopup) {
        maplibre.getCanvas().style.cursor = "";
        popup.remove();
      }
    });

		// Double click event
    maplibre.on("dblclick", (e) => {
	    // Only execute the reposition only when we are in reposition mode
	    // We don't want the model be moving in other situations.
      if (holdPopup) {
	      // Pass the newly clicked coords
        loadModel(e.lngLat);
        setMarker([e.lngLat.lng, e.lngLat.lat]);
        popup.remove();

        maplibre.getCanvas().style.cursor = "";
        maplibre.setCenter(e.lngLat);
        maplibre.setZoom(18);
        maplibre.setPitch(45);
        maplibre.setBearing(-17.5);

        holdPopup = false;

				// Actions happen quickly, let's have a timeout for the 
				// Double click to be enabled.
        setTimeout(() => {
          maplibre.doubleClickZoom.enable();
        }, 100);
      }
    });
  });

	// Initial load of the model
  loadModel(data.coords as LngLatLike);
});
