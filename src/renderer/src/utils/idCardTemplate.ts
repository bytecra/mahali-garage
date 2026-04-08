function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** CR80 at 96dpi — matches Electron printToPDF pageSize 85.6×54 mm (85600×54000 µm). */
const CARD_W_PX = 323
const CARD_H_PX = 204

export function buildIdCardHtml(params: {
  fullName: string
  employeeId: string
  department: string
  phone?: string
  role?: string
  storeName: string
  /** Reserved for future footer / contact line */
  storePhone?: string
  config: {
    showName: boolean
    showId: boolean
    showDepartment: boolean
    showPhone: boolean
    bgColor: string
    textColor: string
  }
}): string {
  const { fullName, employeeId, department, phone, role, storeName, config } = params

  const initials = fullName
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')

  const deptLabel = department ? department.charAt(0).toUpperCase() + department.slice(1) : ''

  const safeBg = escapeHtml(config.bgColor)
  const safeText = escapeHtml(config.textColor)

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=${CARD_W_PX}">
  <style>
    /*
     * Pixel-based layout: Chromium's printToPDF often paints blank output when the only
     * sizing is mm + flex (flex:1 collapses). Grid + explicit px matches the preview reliably.
     */
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    html {
      width: ${CARD_W_PX}px;
      height: ${CARD_H_PX}px;
      background: #ffffff;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    body {
      width: ${CARD_W_PX}px;
      height: ${CARD_H_PX}px;
      font-family: 'Segoe UI', Arial, sans-serif;
      overflow: hidden;
      /* Keep root neutral: printToPDF can map the full page to the PDF; theme color lives on .card only. */
      background: #ffffff;
      color: ${safeText};
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .card {
      width: ${CARD_W_PX}px;
      height: ${CARD_H_PX}px;
      display: grid;
      grid-template-rows: auto minmax(72px, 1fr) auto;
      position: relative;
      background: ${safeBg};
      color: ${safeText};
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .header {
      background: rgba(0,0,0,0.2);
      padding: 5px 10px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      min-height: 26px;
    }
    .store-name {
      font-size: 9px;
      font-weight: 700;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      color: ${safeText};
      opacity: 0.9;
    }
    .dept-badge {
      font-size: 7px;
      padding: 1px 6px;
      border-radius: 9999px;
      background: rgba(255,255,255,0.2);
      color: ${safeText};
    }
    .body {
      display: flex;
      align-items: center;
      padding: 8px 12px;
      gap: 12px;
      min-height: 0;
    }
    .avatar {
      width: 68px;
      height: 68px;
      border-radius: 50%;
      background: rgba(255,255,255,0.15);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 14px;
      font-weight: 700;
      color: ${safeText};
      flex-shrink: 0;
      border: 2px solid rgba(255,255,255,0.3);
    }
    .info {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 3px;
      min-width: 0;
    }
    .name {
      font-size: 12px;
      font-weight: 700;
      color: ${safeText};
      line-height: 1.2;
    }
    .role {
      font-size: 8px;
      color: ${safeText};
      opacity: 0.75;
      text-transform: capitalize;
    }
    .id-number {
      font-size: 10px;
      font-weight: 600;
      font-family: 'Courier New', monospace;
      color: ${safeText};
      background: rgba(0,0,0,0.15);
      padding: 2px 6px;
      border-radius: 4px;
      display: inline-block;
      margin-top: 2px;
      letter-spacing: 0.05em;
    }
    .phone {
      font-size: 8px;
      color: ${safeText};
      opacity: 0.8;
      margin-top: 2px;
    }
    .footer {
      background: rgba(0,0,0,0.15);
      padding: 3px 10px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      min-height: 18px;
    }
    .footer-text {
      font-size: 7px;
      color: ${safeText};
      opacity: 0.7;
    }
    .stripe {
      position: absolute;
      bottom: 38px;
      left: 0;
      right: 0;
      height: 1px;
      background: rgba(255,255,255,0.1);
    }
  </style>
</head>
<body>
  <div class="card">

    <div class="header">
      <span class="store-name">
        ${escapeHtml(storeName)}
      </span>
      ${
        config.showDepartment && deptLabel
          ? `<span class="dept-badge">
            ${escapeHtml(deptLabel)}
           </span>`
          : ''
      }
    </div>

    <div class="body">
      <div class="avatar">${escapeHtml(initials)}</div>
      <div class="info">
        ${config.showName ? `<p class="name">${escapeHtml(fullName)}</p>` : ''}
        ${role ? `<p class="role">${escapeHtml(role)}</p>` : ''}
        ${config.showId ? `<p class="id-number">${escapeHtml(employeeId)}</p>` : ''}
        ${config.showPhone && phone ? `<p class="phone">Tel. ${escapeHtml(phone)}</p>` : ''}
      </div>
    </div>

    <div class="footer">
      <span class="footer-text">
        EMPLOYEE ID CARD
      </span>
      <span class="footer-text">
        Mahali Garage
      </span>
    </div>

  </div>
</body>
</html>`
}
