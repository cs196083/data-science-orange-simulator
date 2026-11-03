# 데이터 과학 프로젝트 시뮬레이터 (오렌지로 배우는 기계학습)

교과서 「Ⅳ. 데이터 과학 프로젝트 – 일상생활의 데이터에 기반한 스트레스 지수 예측」(174~195쪽)을
오렌지(Orange Data Mining)로 단계별로 따라 하고, **학생이 자기 데이터(CSV)** 로 같은 과정을 연습한 뒤
발표용 PPT를 만들 수 있도록 돕는 수업 자료입니다.

## 웹 시뮬레이터
👉 **https://cs196083.github.io/data-science-orange-simulator/**

| 단계 | 내용 | 오렌지 위젯 |
|---|---|---|
| ① 문제 정의 | 탐구 질문, target/feature, 회귀·분류·군집 구분, 데이터 점검표 | - |
| ② 데이터 수집 | 속성 유형(numeric/categorical)·역할 설정, 데이터 수·결측 비율 | File, Data Table |
| ③ 데이터 전처리 | 결측치 처리, 이상치(IQR) 제거, 0~1 정규화 | Feature Statistics, Impute, Scatter Plot, Box Plot, Select Rows, Preprocess |
| ④ 시각화와 분석 | 분포, 상관계수 | Distributions, Correlations |
| ⑤ 데이터 모델링 | feature/target 분리, 7:3 분할, 여러 모델 학습 | Select Columns, Data Sampler, Linear Regression, Random Forest, kNN, SVM |
| ⑥ 평가 | 교차 검증, MSE·RMSE·MAE·R² (분류: CA·F1 등) 비교 | Test and Score, Predictions |
| PPT | 12장 슬라이드 구성, 결과 자동 요약, 자기 평가표 | - |

- 위쪽 **📂 내 CSV 불러오기**로 학생 데이터를 넣으면 모든 단계가 그 데이터로 다시 계산됩니다 (파일은 브라우저 밖으로 전송되지 않음).
- target이 숫자면 회귀, 범주형이면 분류 모델로 자동 전환됩니다.
- `?demo`를 주소 뒤에 붙이면 예제 데이터로 모델 학습까지 자동 실행됩니다 (수업 시연용).

## 오렌지 워크플로 파일 (`orange_workflows/`)
Orange 3.37에서 만들고 실행 검증한 단계별 누적 워크플로입니다. **`daily_data.csv`와 같은 폴더**에 두고 여세요.

| 파일 | 포함 내용 | 결과 |
|---|---|---|
| `1_데이터수집.ows` | File(grade → categorical) → Data Table | 83행 |
| `2_데이터전처리.ows` | + Feature Statistics, Scatter Plot×2, Box Plot, Impute, Select Rows, Preprocess | 83 → 81 → 65행 |
| `3_시각화와분석.ows` | + Distributions, Correlations | |
| `4_데이터모델링.ows` | + Select Columns, Data Sampler(70%), 4개 회귀 모델 | 훈련 46 / 테스트 19 |
| `5_평가_전체워크플로.ows` | + Test and Score(5-fold), Predictions | 완성본 |

> `daily_data.csv`는 교과서 데이터를 본떠 만든 **연습용 가상 데이터**입니다(83명, 결측치 2개, 이상치 포함).
