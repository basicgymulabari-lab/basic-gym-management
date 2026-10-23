let razorpayScriptPromise: Promise<void> | null = null;

export function loadRazorpayCheckout() {
  if (window.Razorpay) return Promise.resolve();
  if (razorpayScriptPromise) return razorpayScriptPromise;

  const script = document.createElement("script");
  script.src = "https://checkout.razorpay.com/v1/checkout.js";
  script.async = true;

  const pending = new Promise<void>((resolve, reject) => {
    script.onload = () => {
      if (window.Razorpay) {
        resolve();
        return;
      }
      script.remove();
      if (razorpayScriptPromise === pending) razorpayScriptPromise = null;
      reject(new Error("Razorpay Checkout could not be initialized."));
    };
    script.onerror = () => {
      script.remove();
      if (razorpayScriptPromise === pending) razorpayScriptPromise = null;
      reject(new Error("Razorpay Checkout could not be loaded."));
    };
  });

  razorpayScriptPromise = pending;
  document.head.appendChild(script);
  return pending;
}
