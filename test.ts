const run = async () => {
  try {
    const voices = await searchVoices({ search: "warm narrator", pageSize: 5 });
    console.log(voices);
  } catch (e) {
    console.error(e.message);
  }
}
run();