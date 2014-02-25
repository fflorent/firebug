function fibonacci(n) {
  if (n <= 1)
    return n < 0 ? 0 : n;
  return fibonacci(n - 1) + fibonacci(n - 2);
}

(function()
{
    // xxxFlorent: From one of the two lines above. The debugger would resume.
    window.__defineGetter__('a', () => console.log("get a"));
    a + a;
})();

