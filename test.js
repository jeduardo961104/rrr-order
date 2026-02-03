function testCreateOrder() {
  const res = createOrder({
    van: "VAN-01",
    associate: "Test",
    issueType: "Engine",
    description: "Test order",
    priority: "MED",
    eta: "Today",
    mechanic: "Ernesto"
  });
  Logger.log(JSON.stringify(res));
}
function testWorkStatusRead() {
  const data = getWorkStatusData(50);
  Logger.log(JSON.stringify(data, null, 2));
  return data;
}
