const run = async () => {
    try {
        console.log("Global keys:", Object.keys(global));
        const voices = await searchVoices({ search: "warm narrator", pageSize: 5 });
        console.log(voices);
    } catch(e) {
        console.error(e.message);
    }
}
run();