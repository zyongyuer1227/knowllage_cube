export type DocumentAttributeInput = {
  businessPath?: string[] | null;
  legalPath?: string[] | null;
};

export type DocumentTaxonomyNode = {
  name: string;
  children: DocumentTaxonomyNode[];
};

export type DocumentTaxonomyConfig = {
  businessDomains: DocumentTaxonomyNode[];
  legalLevels: DocumentTaxonomyNode[];
};

export const DEFAULT_DOCUMENT_TAXONOMY: DocumentTaxonomyConfig = {
  businessDomains: [
    { name: "公路工程", children: [] },
    {
      name: "道路运输",
      children: [
        { name: "道路旅客运输", children: [] },
        { name: "道路货物运输", children: [] },
        { name: "危险货物运输", children: [] },
        { name: "出租汽车与网约车", children: [] },
        { name: "运输辅助业", children: [] }
      ]
    },
    { name: "水路运输", children: [] },
    { name: "港口行政", children: [] },
    { name: "航道行政", children: [] },
    { name: "地方海事行政", children: [] },
    { name: "工程质量监督", children: [] },
    { name: "安全生产", children: [] }
  ],
  legalLevels: [
    { name: "法律", children: [] },
    { name: "行政法规", children: [] },
    { name: "部门规章", children: [] },
    { name: "地方性法规", children: [] },
    { name: "地方政府规章", children: [] },
    { name: "规范性文件", children: [] },
    { name: "司法解释", children: [] },
    { name: "技术标准", children: [] }
  ]
};
