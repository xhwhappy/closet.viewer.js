import * as THREE from "@/lib/threejs/three";
import { readByteArray } from "@/lib/clo/file/KeyValueMapReader";
import FittingGarment from "./FittingGarment";
import FittingAvatar from "./FittingAvatar";
// import ResizableBody from "./FittingResizableBody";
import { loadZrestForFitting, processAvatarSizingFile } from "./FittingIO";
import { computeBarycentric } from "./FittingBarycentricCoord";
import FittingSkinControllerManager from "./FittingSkinControllerManager";

export default class Fitting {
  constructor({ scene: scene, zrest: zrest }) {
    // Set containers for three.js
    this.scene = scene;
    this.container = new THREE.Object3D();
    // this.container.name = "fittingContainer";
    // this.scene.add(this.container);
    zrest.addThreeContainerUniquely(this.container, "fittingContainer");

    // this.mapTriangleIdx = new Map();

    // this.listPositions = [];
    // this.listAvatarMesh = [];
    // this.listAvatarMeshIdx = [];
    // this.bodySkinController = null;
    // this.bodyVertexIndex = [];
    // this.bodyVertexPos = [];

    this.processAvatarSizingFile = processAvatarSizingFile;
    this.getSizes = () => {
      return null;
    };

    this.avatarId = 0;
    this.avatarSkinType = 0;

    this.zrest = zrest;
    this.avatar = null;

    this.garment = new FittingGarment();
    this.getZcrpFilename = this.garment.getGarmentFileName;
    this.loadZcrp = this.garment.loadZcrp;
    this.loadDrapingSamplingJSON = ({
      rootPath,
      height,
      weight,
      mapMatMesh,
    }) => {
      return this.garment.loadSamplingJson({
        rootPath,
        height,
        weight,
        mapMatMesh,
      });
    };
    this.loadDrapingDataFromURL = this.garment.loadDrapingDataFromURL;
  }

  async loadResizableAvatar({ avatarURL, sizingURL, accURL }) {
    console.log("\t++loadAvatar");
    await this.loadAvatar({ url: avatarURL });
    console.log("\t--loadAvatar");
    console.log("\t++loadAvatarResizingData");
    await this.loadAvatarResizingData({ sizingURL, accURL });
    console.log("\t--loadAvatarResizingData");
  }

  async loadAvatar({ url, onProgress, onLoad }) {
    // TODO: Error when calling repeatedly. Fix it.
    // this.zrest.clear();
    await loadZrestForFitting({
      url: url,
      funcOnProgress: onProgress,
      funcOnLoad: onLoad,
      zrest: this.zrest,
      isAvatar: true,
    });

    this.avatar = new FittingAvatar(this.container, this.zrest);
    this.avatar.init();
  }

  async loadAvatarResizingData({ sizingURL, accURL }) {
    console.log("\t\t++processAvatarSizingFile");
    const avatarSizingInfoObj = await processAvatarSizingFile({
      sizingURL,
      accURL,
    });
    console.log("\t\t--processAvatarSizingFile");
    console.log("\t\t++initResizableBodyWithAcc");
    this.avatar.initResizableBodyWithAcc(avatarSizingInfoObj);
    console.log("\t\t--initResizableBodyWithAcc");
  }

  async resizeAvatarWithAcc({
    height,
    weight,
    bodyShape,
    chest = -1,
    waist = -1,
    hip = -1,
    armLength = -1,
    legLength = -1,
  }) {
    // console.log({
    //   height,
    //   weight,
    //   bodyShape,
    // });
    await this.resizeAvatar({
      height,
      weight,
      bodyShape,
      chest,
      waist,
      hip,
      armLength,
      legLength,
    });
    await this.resizeAccessory();
  }

  async resizeAvatar({
    height,
    weight,
    bodyShape,
    chest = -1,
    waist = -1,
    hip = -1,
    armLength = -1,
    legLength = -1,
  }) {
    if (!this.avatar) return;
    this.avatar.resize({
      height,
      weight,
      bodyShape,
      chest,
      waist,
      hip,
      armLength,
      legLength,
    });
  }

  resizeAccessory() {
    if (!this.avatar) return;
    this.avatar.resizeAccessory();
  }

  async loadGarmentData({ garmentURL, samplingURL }) {
    console.log("+ loadGarment");
    await this.loadGarment({ url: garmentURL, onProgress: null, onLoad: null });
    console.log("- loadGarment");

    this.garment.init({
      bodyVertexIndex: this.avatar.bodyVertexIndex,
      bodyVertexPos: this.avatar.bodyVertexPos,
      zrest: this.zrest,
      // rootMap: this.zrest.zProperty.rootMap,
    });

    // this.garment.setBody(
    //   this.avatar.bodyVertexPos,
    //   this.avatar.bodyVertexIndex
    // );
    // console.log(this.avatar.bodyVertexPos, this.avatar.bodyVertexIndex);
    //this.avatar.get
    console.log("+ loadSamplingJson");
    await this.garment.loadSamplingJson({
      jsonURL: samplingURL,
    });
    console.log("- loadSamplingJson");
  }

  async loadGarment({ url, onProgress, onLoad }) {
    // TODO: Error when calling repeatedly. Fix it.
    // this.zrest.clear();
    await loadZrestForFitting({
      url: url,
      // funcOnProgress: onProgress,
      // funcOnLoad: onLoad,
      zrest: this.zrest,
      isAvatar: false,
    });
  }

  async drapingUsingZcrpURL({ zcrpURL }) {
    await this.garment.loadZcrp(zcrpURL);
    const listBarycentricCoord = this.garment.listBarycentricCoord;
    const mapMatMesh = this.zrest.matMeshMap;
    this.garment.draping({ listBarycentricCoord, mapMatMesh });
  }

  async resizingSupplementsUsingURL(supplementsURL) {
    const mapMatMesh = this.zrest.matMeshMap;
    const mapTransMatrix = this.buildMapTransform3DMatrix(
      this.zrest.zProperty.rootMap
    );
    const testOnly = await this.garment.resizingSupplement(
      supplementsURL,
      mapMatMesh,
      mapTransMatrix
    );
    // this.zrest.scene.add(testOnly);
  }

  buildMapTransform3DMatrix(rootMap) {
    console.log(rootMap);
    const mapTransMatrix = new Map();
    const listChildrenTransformer3D = rootMap
      .get("mapGeometry")
      .get("listChildrenTransformer3D");
    const idenMatrix = new THREE.Matrix4().identity();

    const parse = (listTF3D, parentMatrix) => {
      const multiMatrix = parentMatrix || idenMatrix;

      listTF3D.forEach((tf) => {
        const childListTF3D = tf.get("listChildrenTransformer3D");
        const LtoW = this.convertCLOMatrixToThree(tf.get("m4LtoW")).multiply(
          multiMatrix
        );
        const m4Matrix = this.convertCLOMatrixToThree(tf.get("m4Matrix"));
        const transID = tf.get("uiID");

        if (childListTF3D) {
          parse(childListTF3D, LtoW);
        }
        mapTransMatrix.set(transID, { LtoW: LtoW, matrix: m4Matrix });
      });
    };

    parse(listChildrenTransformer3D);

    return mapTransMatrix;
  }

  getMatrix4(matrixFromCLO) {
    return new THREE.Matrix4().fromArray(Object.values(matrixFromCLO));
  }

  convertCLOMatrixToThree(matrix) {
    return this.getMatrix4(matrix);

    const m = matrix;

    // prettier-ignore
    const result = new THREE.Matrix4().set(
      m.a00, m.a01, m.a02, m.a03,
      m.a10, m.a11, m.a12, m.a13,
      m.a20, m.a21, m.a22, m.a23,
      m.a30, m.a31, m.a32, m.a33);

    return result;
  }
}
