const testAnalyze = async () => {
  try {
    const res = await fetch('http://localhost:3000/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filePath: 'test_rec_1781189062462.webm' })
    });
    const data = await res.json();
    console.log("Response:", res.status, data);
  } catch (err) {
    console.error("Error:", err);
  }
};

testAnalyze();
