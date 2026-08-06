진행상황
receiver_area 형식통일
region_type =receiver_area 맞출

accepted_at는 yyyy-mm-dd  hh:mm:ss
eta_date는 yyyy-mm-dd
형식 통일

weight_kg	"kg" 문자열 제거 후 숫자형 변환	
width_cm	"cm" 문자열 제거 후 숫자형 변환	
billed_weight_kg 문자열 제거 후 숫자형 변환	


volume_weight_kg (부피 무게)	
width_cm x height_cm x depth_cm / 6000
billed_weight_kg (요금 무게)

| 크기 등급 | 세 변의 합 | 무게 상한 | 일반 | 제주 | 도서산간 |
|---|---|---|---|---|---|
| 극소형 | 60cm 이하 | 2kg 이하 | 3,500원 | 6,500원 | 8,500원 |
| 소형 | 80cm 이하 | 5kg 이하 | 4,000원 | 7,000원 | 9,000원 |
| 중형 | 120cm 이하 | 15kg 이하 | 6,000원 | 9,000원 | 11,000원 |
| 대형 | 160cm 이하 | 25kg 이하 | 9,000원 | 12,000원 | 14,000원 |

max(weight_kg, volume_weight_kg)


cu의 ui를 참고하고 배송 형태는 cj를 따라감
