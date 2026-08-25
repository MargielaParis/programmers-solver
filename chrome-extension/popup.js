const COOKIE_DOMAINS = ["programmers.co.kr", "school.programmers.co.kr"];
const REQUIRED_COOKIE = "_session_production";

document.addEventListener("DOMContentLoaded", () => {
  const statusEl = document.getElementById("status");
  const copyBtn = document.getElementById("copyBtn");
  const copyHint = document.getElementById("copyHint");
  let cookieString = "";

  const getCookies = async () => {
    const results = await Promise.all(
      COOKIE_DOMAINS.map(async (domain) => {
        try {
          return await chrome.cookies.getAll({ domain });
        } catch (error) {
          console.error(`Failed to read cookies for ${domain}`, error);
          return [];
        }
      })
    );
    return results.flat();
  };

  const formatCookieString = (cookies) => {
    const uniqueCookies = new Map();
    for (const cookie of cookies) {
      if (!uniqueCookies.has(cookie.name)) {
        uniqueCookies.set(cookie.name, cookie.value);
      }
    }
    return Array.from(uniqueCookies.entries())
      .map(([name, value]) => `${name}=${value}`)
      .join("; ");
  };

  const hasSession = (cookies) =>
    cookies.some((cookie) => cookie.name === REQUIRED_COOKIE && cookie.value);

  const updateStatus = async () => {
    const cookies = await getCookies();
    if (!hasSession(cookies)) {
      statusEl.className = "status error";
      statusEl.textContent = "로그인 세션을 찾지 못했습니다.";
      copyBtn.disabled = true;
      return;
    }

    cookieString = formatCookieString(cookies);
    statusEl.className = "status success";
    statusEl.textContent = "로그인 세션을 확인했습니다.";
    copyBtn.disabled = false;
  };

  copyBtn.addEventListener("click", async () => {
    if (!cookieString) return;
    try {
      await navigator.clipboard.writeText(cookieString);
      copyBtn.innerHTML = "<span aria-hidden=\"true\">✓</span> 복사됨";
      copyHint.hidden = false;
      window.setTimeout(() => {
        copyBtn.innerHTML = "<span aria-hidden=\"true\">↗</span> 전체 쿠키 복사";
      }, 1800);
    } catch (error) {
      console.error("Failed to copy cookies", error);
      statusEl.className = "status error";
      statusEl.textContent = "클립보드 복사에 실패했습니다.";
    }
  });

  void updateStatus();
});
