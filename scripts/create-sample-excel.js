const XLSX = require('xlsx');

const createSampleExcel = () => {
  const sampleData = [
    {
      'Company Name': 'ABC Exporters Pvt Ltd',
      'Contact Person': 'John Smith',
      'Email': 'john@abcexporters.com',
      'Phone': '+1 234 567 8900',
      'Country': 'United States',
      'Website': 'www.abcexporters.com',
      'HS Code': '8471.30.10',
      'Product Description': 'Laptop Computers'
    },
    {
      'Company Name': 'Global Trade Solutions',
      'Contact Person': 'Sarah Johnson',
      'Email': 'sarah@globaltrade.com',
      'Phone': '+1 555 123 4567',
      'Country': 'Canada',
      'Website': 'www.globaltrade.com',
      'HS Code': '6204.62.00',
      'Product Description': 'Women\'s Cotton Trousers'
    },
    {
      'Company Name': 'Pacific Rim Exports',
      'Contact Person': 'Michael Chen',
      'Email': 'michael@pacificrimexports.com',
      'Phone': '+65 9876 5432',
      'Country': 'Singapore',
      'Website': 'www.pacificrimexports.com',
      'HS Code': '8517.12.00',
      'Product Description': 'Mobile Phones'
    },
    {
      'Company Name': 'European Imports GmbH',
      'Contact Person': 'Hans Mueller',
      'Email': 'hans@europeanimports.de',
      'Phone': '+49 30 12345678',
      'Country': 'Germany',
      'Website': 'www.europeanimports.de',
      'HS Code': '8471.50.00',
      'Product Description': 'Server Computers'
    },
    {
      'Company Name': 'Tokyo Trading Co',
      'Contact Person': 'Yuki Tanaka',
      'Email': 'yuki@tokyotrading.jp',
      'Phone': '+81 3 1234 5678',
      'Country': 'Japan',
      'Website': 'www.tokyotrading.jp',
      'HS Code': '8528.72.00',
      'Product Description': 'LED Television Sets'
    }
  ];

  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet(sampleData);
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Exporters');

  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  return buffer;
};

module.exports = { createSampleExcel };
