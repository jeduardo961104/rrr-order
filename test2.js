function testWorkStatusRead() {
  const data = getWorkStatusData(50);
  Logger.log(JSON.stringify(data, null, 2));
  return data;
}