// 확장 팝업: MVP에서는 상태 표시만, 이후 옵션·히스토리 추가 예정
export default function Popup() {
  return (
    <div style={{ padding: 12, width: 240, fontFamily: 'system-ui, sans-serif' }}>
      <h3 style={{ margin: '0 0 8px' }}>YouTube Ad Detector</h3>
      <p style={{ margin: 0, fontSize: 12, color: '#555' }}>
        유튜브 시청 페이지에서 자동으로 분석이 실행됩니다.
      </p>
    </div>
  )
}
