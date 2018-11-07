const number = Math.random();

const id = setInterval(() => {
  console.log(number);
}, 5000);

setTimeout(() => {
  clearInterval(id);
  throw new Error('lmao');
}, 24000);
