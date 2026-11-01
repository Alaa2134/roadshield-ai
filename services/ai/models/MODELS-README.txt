RoadShield AI — model files for services/ai/models/

roadshield-rdd.onnx + model_card.json
  YOLOv8s road-damage detector (Longitudinal Crack, Transverse Crack, Alligator Crack, Potholes)
  trained on RDD2022 / CRDDC2022 (Japan + India) by github.com/oracl4/RoadDamageDetection,
  exported to ONNX (opset 12). Weights sha256 7f2ceb8f6f3dfcc8fffd98cb488281be725150aed0f06cf21c4db72b5cd0a62b.
  Licence: AGPL-3.0 (Ultralytics YOLOv8). Dataset: RDD2022, CC BY-SA 4.0.

face_ssd/deploy.prototxt + res10_300x300_ssd_iter_140000.caffemodel
  OpenCV ResNet-10 SSD face detector (opencv/opencv samples + opencv_3rdparty), used to blur faces.

Unzip into services/ai/models/ so that services/ai/models/roadshield-rdd.onnx exists,
or rebuild everything with: bash services/ai/scripts/fetch_models.sh
