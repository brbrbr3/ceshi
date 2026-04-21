const app = getApp()
const utils = require('../../../common/utils.js')

Page({
  data: {
    statusBarHeight: 20,
    // 弹窗控制
    showPopup: false,
    popupAnimating: false,
    popupTitle: '',
    popupType: '', // 'checklist' | 'static'
    popupContent: [],
    checkedCount: 0,
    showArrivedButton: true,
    navTitle: '到馆指南',
    // 背景图片云存储链接
    bgImageUrl: '',

    // 行前准备 checklist（原文来自"到馆指南.docx"表格）
    // 结构：{ id, category, detail, note, checked }
    checklistItems: [{
        id: 'vaccine',
        category: '疫苗',
        detail: '请接种黄热疫苗，取得国际疫苗证（小黄本）',
        note: '随身携带',
        checked: false
      },
      {
        id: 'documents',
        category: '证件',
        detail: '护照扫描件电子版、身份证扫描件电子版、1寸、2寸白底照片及其电子版',
        note: '到馆后办理CPF及身份证使用',
        checked: false
      },
      {
        id: 'driver_license',
        category: '驾照',
        detail: '中国驾照原件',
        note: '以备办理翻译件',
        checked: false
      },
      {
        id: 'luggage_life',
        category: '生活行李',
        detail: '床上用品、毛巾、拖鞋、常用衣物',
        note: 'DHL可能延误，请随身带基础用品',
        checked: false
      },
      {
        id: 'luggage_kitchen',
        category: '厨房行李',
        detail: '电饭煲、锅具、筷子、调料、饭盒（建议4个，尺寸不要太小）',
        note: '食堂工作餐需自带饭盒，当地小家电价格高',
        checked: false
      },
      {
        id: 'luggage_electronic',
        category: '电子产品',
        detail: '路由器（WIFI）、插线板、转换插头（多种规格）、手机充电器、充电线、手机壳、汽车用品（手机导航支架等）',
        note: '请提前在淘宝购买多个巴西转换插头，转机路上自备欧洲转换插头（当地电子产品种类少、价格高）',
        checked: false
      },
      {
        id: 'appliance',
        category: '电压电器',
        detail: '巴西利亚220V / 圣保罗110V',
        note: '电器需支持50–60Hz',
        checked: false
      },
      {
        id: 'medicine',
        category: '药品',
        detail: '感冒药、消炎药、抗过敏、肠胃药、蚊虫药、防晒霜',
        note: '当地蚊虫较多、气候干燥、紫外线强',
        checked: false
      },
      {
        id: 'china_sim',
        category: '中国手机卡',
        detail: '保留国内手机号、开通国际漫游',
        note: '用于接收验证码或紧急联系国内',
        checked: false
      },
      {
        id: 'brazil_sim',
        category: '巴西手机卡',
        detail: '提前请处室联络员代办临时电话卡，后续可转让到自己名下，或携号转网换其他套餐',
        note: '无CPF无法申请手机卡、新CPF无信用积分可能无法办理套餐',
        checked: false
      },
      {
        id: 'credit_card',
        category: '信用卡',
        detail: '国际信用卡（Visa / Master Card）',
        note: '提前开通境外支付，注意防范盗刷，尽量避免使用',
        checked: false
      },
      {
        id: 'cash',
        category: '现金',
        detail: '可带少量美元或雷亚尔',
        note: '初期应急使用',
        checked: false
      },
      {
        id: 'work_prep',
        category: '工作准备',
        detail: '提前联系处室联络员',
        note: '了解接机、住宿、手机卡、办公室等安排',
        checked: false
      }
    ],
    allChecked: false,

    // 购物指南（原文来自"到馆指南.docx"）
    // 注：以下地点可自行在Google地图搜索，均为连锁超市
    shoppingContent: [{
        category: '综合超市',
        items: [{
          name: 'Big Box',
          desc: '离馆最近，24小时营业'
        }]
      },
      {
        category: '精品超市',
        items: [{
          name: 'Pão de Açúcar / OBA',
          desc: '生鲜质量好'
        }]
      },
      {
        category: '大型商超',
        items: [{
          name: 'Carrefour / Assaí / Dia a Dia',
          desc: '价格低'
        }]
      },
      {
        category: '山姆超市',
        items: [{
          name: "Sam's Club",
          desc: '需会员'
        }]
      },
      {
        category: '蔬菜早市',
        items: [{
          name: "Ceasa-Sia Sul, Setor de Indùstria e Abastacimento Trecho 10 5- PAV B3, Brasília - DF, 71200-100",
          desc: '周六生鲜蔬菜大市场，建议清晨时间采购'
        }]
      },
      {
        category: '批发市场',
        items: [{
          name: "巴拉圭市场SIA Trecho 7 - SIA, Brasília - DF, 71200-100",
          desc: '当地华人华侨居多，售中国生产小商品，价格高于国内'
        }]
      },
      {
        category: '家居用品',
        items: [{
          name: 'Camicado / Artex / Leory Merlin',
          desc: '家具及居家用品，多为中国制造，价格高于国内'
        }]
      },
      {
        category: '运动用品',
        items: [{
          name: 'Decathlon',
          desc: '运动品类齐全'
        }]
      },
      {
        category: '商场',
        items: [{
          name: 'Park Shopping / Iguatemi / Conjunto Nacional / Brasília Shopping / Pier 21',
          desc: '大型商场，可购买服装、鞋包、化妆品、香水等'
        }]
      }
    ],

    // 中餐/华人资源（原文来自"到馆指南.docx"）
    chineseContent: [{
        category: '华人（品类较全，购买次日送货至使馆，价格高于国内）',
        items: [{
            name: '慧莉',
            desc: '微信：Jin982479165'
          },
          {
            name: '岳花',
            desc: '微信：zhangsen2007816'
          }
        ]
      },
      {
        category: '中超（亚洲食物及用品较齐全，价格高于国内）',
        items: [{
            name: 'Mikami',
            desc: '日本超市'
          },
          {
            name: 'Daiso',
            desc: '日本大创百货连锁店'
          }
        ]
      },
      {
        category: '中餐厅（味道一般，价格高于国内）',
        items: [{
            name: '陈府餐厅',
            desc: '送餐微信：Moonshine1028_'
          },
          {
            name: '龙餐厅Restaurante Long',
            desc: ''
          },
          {
            name: '龙福宫Palace Long Fu',
            desc: ''
          }
        ]
      },
      {
        category: '巴西烤肉（正宗巴西自助烤肉店，午餐价格高于晚餐，人均约150-250雷含服务费、饮料费）',
        items: [{
            name: 'Sal e brasa',
            desc: '市中心'
          },
          {
            name: 'Fogo de chão',
            desc: '高端连锁店'
          },
          {
            name: 'NATIVA',
            desc: '湖畔小区附近'
          },
          {
            name: 'Steak bull',
            desc: 'L4大道使馆附近'
          }
        ]
      },
      {
        category: '巴西公斤饭（称重式快餐厅，物美价廉）',
        items: [{
            name: 'Gaúcho do Planalto',
            desc: '馆员称“二食堂”，可自助或称重，价格低'
          },
          {
            name: 'Asa Gaúcha Restaurante',
            desc: ''
          },
          {
            name: '各商场顶层美食城',
            desc: ''
          },
        ]
      },
      {
        category: '特色餐馆（均为市区内巴西本地餐饮品牌，人均消费与北京持平）',
        items: [{
            name: 'Pontão',
            desc: '巴西利亚集中休闲餐饮娱乐区'
          },
          {
            name: 'Madero / Cocobamboo / Vasto / Pobre Juan',
            desc: '巴西菜连锁餐厅'
          },
          {
            name: 'Gurumê / Montarosushi / Kawa',
            desc: '日本料理'
          },
        ]
      }
    ],

    // 网购平台（原文来自"到馆指南.docx"）
    shoppingOnlineContent: [{
        category: '平台',
        items: [{
            name: 'Amazon / Mercado Livre',
            desc: '巴西主流电商，发货速度快'
          },
          {
            name: 'Shopee / Shein',
            desc: '价格低'
          },
          {
            name: 'AliExpress',
            desc: '国内发货，时间长'
          }
        ]
      },
      {
        category: '服饰',
        items: [{
          name: 'Zara / Renner / Dafiti 等品牌官网',
          desc: ''
        }]
      },
      {
        category: '美妆',
        items: [{
          name: 'Sephora / Beleza na Web / Natura / 巴西欧舒丹',
          desc: ''
        }]
      }
    ],

    // 就医信息（原文来自"到馆指南.docx"）
    medicalContent: [{
        category: '一、根据国内规定，馆员就医实行事前审批制度。报销医院详见以下就诊医院目录：',
      },
      {
        category: '私立综合性医院',
        items: [{
            name: 'Hospital Sírio-Libanês',
            desc: ''
          },
          {
            name: 'DF Star-Rede D\'OR',
            desc: ''
          },
          {
            name: 'Hospital Brasília',
            desc: ''
          },
          {
            name: 'Hospital Daher',
            desc: ''
          },
          {
            name: 'Hospital Santa Lúcia',
            desc: ''
          },
          {
            name: 'Hospital Santa Luzia',
            desc: ''
          }
        ]
      },
      {
        category: '私立综合性医院（骨科专长）',
        items: [{
          name: 'Hospital Home',
          desc: ''
        }]
      },
      {
        category: '公立医院',
        items: [{
            name: 'Sarah Kubitschek',
            desc: '残障人士友好'
          },
          {
            name: 'Hospital das Forças Armadas',
            desc: ''
          }
        ]
      },
      {
        category: '牙科',
        items: [{
            name: 'Rita Trindade',
            desc: ''
          },
          {
            name: 'Clínica Implanto Odontologia Especializada',
            desc: ''
          },
          {
            name: 'Moreti Odontologia',
            desc: ''
          },
          {
            name: 'Crool by Rios',
            desc: ''
          }
        ]
      },
      {
        category: '眼科',
        items: [{
          name: 'CBV',
          desc: ''
        }]
      },
      {
        category: '临床医学检查',
        items: [{
            name: 'Laboratório Sabin',
            desc: '巴西临床医学典范'
          },
          {
            name: 'Exame Imagem e Laboratório',
            desc: '临床医学检查与疫苗注射'
          },
          {
            name: 'IMEB Crispim',
            desc: ''
          }
        ]
      },
      {
        category: '骨科',
        items: [{
          name: 'Cote Brasília',
          desc: ''
        }]
      },
      {
        category: '皮肤科',
        items: [{
            name: 'Aluma Dermatologia e Laser',
            desc: ''
          },
          {
            name: 'Verveine',
            desc: ''
          },
          {
            name: 'Inovaderm',
            desc: ''
          }
        ]
      },
      {
        category: '过敏',
        items: [{
          name: 'Consultório Natasha Ferraroni',
          desc: ''
        }]
      },
      {
        category: '风湿科',
        items: [{
          name: 'Rheos. Reumatologia e Clínica Médica',
          desc: ''
        }]
      },
      {
        category: '消化科',
        items: [{
          name: 'Prodigest',
          desc: ''
        }]
      },
      {
        category: '耳鼻喉科',
        items: [{
          name: 'CEOL ENT-Otorhinolaryngology Clinic',
          desc: ''
        }]
      },
      {
        category: '针灸',
        items: [{
            name: 'Centro de Acupuntura Shen',
            desc: ''
          },
          {
            name: 'Clínica de Acupuntura Chinesa Brasília',
            desc: ''
          }
        ]
      },
      {
        category: '妇产科',
        items: [{
          name: 'Maternidade Brasília',
          desc: ''
        }]
      },
      {
        category: '妇幼专科',
        items: [{
          name: 'Hospital Materno Infantil de Brasília',
          desc: ''
        }]
      },
      {
        category: '多种专科',
        items: [{
          name: 'CRIAPP',
          desc: ''
        }]
      },
      {
        category: '二、巴西私立医院就医流程指南',
      },
      {
        category: '公立医院全免费，但预约就医时间长、程序繁琐。目前，大部分馆员选择私立医院就医。\n\n以使馆附近Santa Lucia医院为例，我馆与Santa Lucia有合作协议，支持先就诊，后缴费（邮件发送）。但据馆员反馈，缴费单一般几个月才能发来，建议馆员于现场付费结清后即索要发票、就医明细单等留存报销用。非语言干部就医可自行协调本处语言干部陪同，办公室外勤只负责协助危重人员、特殊情况人员就医。',
        items: [{
            name: '1.判断是否急诊',
            desc: '一般情况下都选择急诊。普通门诊大多需线上预约，且排队时间过长，无法当天就诊。'
          },
          {
            name: '2.出发前准备',
            desc: '携带：就诊人巴西身份证、如就诊人为儿童，需监护人巴西外交官证（没有身份证请准备护照）、准备现金、信用卡或Pix付款。'
          },
          {
            name: '3.到达医院',
            desc: '-直接前往Santa Lucia医院急诊部（标识：Emergência / Pronto-Socorro）。\n-于机器上取号，老弱病残幼可选择Atendimento Preferencial，其他则选Atendimento Comum。'
          },
          {
            name: '4.分诊登记',
            desc: '-叫号后前往分诊台(Triagem)。\n-告知主要症状后，由护士测量评判生命体征并分配病症等级手环（按照病状由轻到重大致分为蓝色、绿色、黄色、橘色、红色，和排队时间挂钩）。\n'
          },
          {
            name: '5.挂号缴费',
            desc: '-由工作人员引导至柜台登记信息，明确告知："Sou particular, sem convênio."（我是自费患者，无医保）。\n-出示证件，支付急诊挂号费 (价格通常在 500-800雷亚尔）。\n'
          },
          {
            name: '6.等待就诊',
            desc: '根据病情紧急程度排队。非危重情况可能等待1-4小时，叫号后进入医生诊室。'
          },
          {
            name: '7.医生接诊',
            desc: '-医生问诊、检查。\n-如需进一步检查（化验、X光、CT等），医生会开单，部分医院既涵盖以上项目，根据医生指示前往相关科室预约检验项目。若不含，需前往医院外的其他化验中心（如sabin）或专门拍片机构。\n-医院不出售药物，凭凭处方到医院药房或外部药店（如Drogasil,Drogaria Rosário,Farmácia等）购药。\n-注：留医生联系方式，若需复诊可联系预约。'
          },
          {
            name: '8.检查与付费',
            desc: '根据医生指示拿着检查单去缴费处缴费，留存发票。'
          },
          {
            name: '9.复诊与治疗',
            desc: '拍片或化验结果出来后，拿到结果后返回医生处，医生给出最终诊断、开具处方或建议留院观察 / 住院。'
          }
        ]
      }
    ],

    bankContent: [{
      category: '巴西利亚当地金融业相对滞后，传统银行账户功能受限较为普遍，基本不提供货币兑换、国际转账等服务。建议新到任馆员注意以下事项：',
    }, {
      category: '一、优先办理Pix',
    }, {
      category: 'Pix是巴西广泛使用的即时支付系统，通过手机扫码即可完成付款，便捷高效。建议在取得外交官证（身份证）后尽快开通Pix，以用于日常消费、账单支付等。\n\n在未取得巴西当地身份证前的头几个月，无法开立本地银行账户或使用Pix。此期间主要依赖现金支付。可备用国际信用卡（Visa），但需特别注意防范盗刷风险，建议仅在信誉良好的大型商户使用，避免在小店铺或非正规场所刷卡，并定期核对账单。',
    }, {
      category: '二、当地主要银行',

      items: [{
          name: 'Nubank',
          desc: '数字银行，全线上开户、无实体网点，申请便捷，Pix功能完善，开户速度快。目前我馆馆员普遍使用该数字银行业务。'
        },
        {
          name: 'Banco do Brasil',
          desc: '国有传统银行，网点最多，使馆附近Gilberto Salomão有最近的业务网点。安全性高，但国际转账功能受限，适合需要实体网点服务、长期稳定使用的人员。'
        },
        {
          name: 'Santander',
          desc: '大型私营银行，网点较多，使馆附近Asa Sul区有多家业务网点。'
        }
      ]
    }],

    transportContent: [{
      category: '由于巴西利亚本地巴士、地铁线路较少且治安不及国内，不便于乘坐公共交通出行，建议下载并用巴西手机卡注册Uber或99打车软件。此外，部分馆员反应华为手机无法使用谷歌及Uber软件，建议做好手机的调试工作，以免耽误出行。'
    }],

    websiteContent: [{
        category: '租房',
        items: [{
            name: 'https://www.dfimoveis.com.br/',
            desc: '',
            type: 'link'
          },
          {
            name: 'https://www.wimoveis.com.br/',
            desc: '',
            type: 'link'
          },
          {
            name: 'https://www.quintoandar.com.br/',
            desc: '',
            type: 'link'
          },
          {
            name: 'https://www.legacydf.com.br/',
            desc: '',
            type: 'link'
          }
        ]
      },
      {
        category: '查违章',
        items: [{
            name: 'https://portal.detran.df.gov.br/#/servicos/detran-digital/veiculos/consulta/debitos',
            desc: '联邦区车管所',
            type: 'link'
          },
          {
            name: 'https://radar.serpro.gov.br/main.html#/cidadao',
            desc: '联邦区交管局',
            type: 'link'
          }
        ]
      },
      {
        category: '缴电费',
        items: [{
          name: 'https://agenciavirtual.neoenergiabrasilia.com.br/',
          desc: '',
          type: 'link'
        }]
      },
    ],

    // 子女就学（结构化数据，从原 richtext-school 硬编码文本提取）
    schoolContent: [{
        category: '一、巴西当地基础教育分为公立和私立两部分。公立学校免费，但教学质量差。私立学校教学质量较好，但费用差别较大。'
      },
      {
        category: '二、当地国际学校有巴西利亚国际学校（Brasilia International School）、美国学校（American School of Brasilia）和英国学校（British School of Brasilia）、国际学校（School of Nations）等。国际学校入学一般要交赞助费、注册费等。目前，大多数馆员子女选择美国学校或英国学校就学，少量就读于School of Nations等当地国际学校。具体学费报销按现行财务制度办理，详情请询会计室。'
      },
      {
        category: '注：当地国际学校学位紧张，非即报即入学，多数情况需排队等待空余学位名额，建议家长参阅官网详细报名流程并尽早联系学校招生办（联系方式附后），表明入学意愿、告知拟入学儿童相关信息。'
      },
      {
        category: '各学校联系方式、官网、地址',
        category: '美国学校（American School of Brasilia）：',
        items: [{
            name: 'admissions@eabdf.br',
            desc: '招生邮箱',
            type: 'email'
          },
          {
            name: '+55(61)3442-9700',
            desc: '招生电话',
            type: 'phone'
          },
          {
            name: 'https://www.eabdf.br/',
            desc: '官网',
            type: 'link'
          },
          {
            name: 'SGAS II SGAS 605 Conjunto E Lotes 34/37 - Asa Sul, Brasília - DF, 70200-650',
            desc: '地址',
            type: 'address',
            latitude: -15.8177,
            longitude: -47.8897
          }
        ]
      }, {
        category: '英国学校（British School of Brasilia）：',
        items: [{
            name: 'admissions@britishschoolbrasilia.org',
            desc: '招生邮箱',
            type: 'email'
          },
          {
            name: '+55(61)98277-0054',
            desc: '招生电话',
            type: 'phone'
          },
          {
            name: 'https://www.britishschoolbrasilia.org/',
            desc: '官网',
            type: 'link'
          },
          {
            name: 'St. de Habitações Individuais Sul EQI 7/9 Conjunto 17 LOTE F - Lago Sul, Brasília - DF, 71615-370',
            desc: '地址',
            type: 'address',
            latitude: -15.8427,
            longitude: -47.8803
          }
        ]
      }, {
        category: '国际学校（School of Nations）：',
        items: [{
            name: 'lucas.costa@edn.org.br',
            desc: '招生邮箱',
            type: 'email'
          },
          {
            name: '+55(61)3366-1800',
            desc: '招生电话',
            type: 'phone'
          },
          {
            name: 'https://www.schoolofthenations.com.br/',
            desc: '官网',
            type: 'link'
          },
          {
            name: 'St. de Habitações Individuais Sul QI 21 Área Especial Conjunto C1 - Lago Sul, Brasília - DF, 71655-600',
            desc: '地址',
            type: 'address',
            latitude: -15.8539,
            longitude: -47.8506
          }
        ]
      }, {
        category: '巴西利亚国际学校（Brasilia International School）：',
        items: [{
            name: 'office@biseagles.com',
            desc: '招生邮箱',
            type: 'email'
          },
          {
            name: '+55(61)3246-1306',
            desc: '招生电话',
            type: 'phone'
          },
          {
            name: 'https://www.brasiliainternationalschool.com/pt',
            desc: '官网',
            type: 'link'
          },
          {
            name: 'Conjunto C Lotes 67/68, SGAS 914 - Asa Sul, Brasília - DF, 70390-140',
            desc: '地址',
            type: 'address',
            latitude: -15.8225,
            longitude: -47.9260
          }
        ]
      },
      {
        category: '巴西利亚美国学校（EAB）简介',
        items: [{
            name: '1、学制',
            desc: '分为Lower school（K3，K4，K5,Grade 1-5）和Upper school。Lower school相当于国内的幼儿园和小学。Upper school相当于国内的初中和高中。该学校没有大学阶段课程。'
          },
          {
            name: '2、学费',
            desc: '每年会根据通胀率等因素略有上涨。一年交12个月学费。每学年学费为约为112416-117756雷亚尔。若孩子为学期中插班生（非从学年伊始开始报名），需另交一笔相当于一个月学费金额的插班费。如加上注册费，就学总费用将可能超出报销上限，详询会计室。'
          },
          {
            name: '3、主要课程',
            desc: 'K3和K4的主要课程有艺术、科学、音乐、体育、图书馆课，K5开始每天都有葡语课。小学开设课程主要有英语、数学、体育、艺术和葡语等。'
          },
          {
            name: '4、考试情况',
            desc: 'K3至K5阶段没有考试。小学有在线测评。'
          },
          {
            name: '5、入学要求或限制',
            desc: '入K3要求年满3岁，具体可询admissions@eabdf.br。美国学校入学名额比较紧张，需要提前向负责注册的老师登记排队，且需缴纳注册费。缴纳注册费的馆员子女可享受优先入学待遇。申请入学需携带出生证明、疫苗接种证书（如疫苗本上没有英文，需事先在国内在出国人员体检中心将疫苗本换成英文版本）、护照及复印件、血型证明（当地可以验血出证明）、上一个学校的推荐信（如有）等。'
          },
          {
            name: '6、午餐费、在校时间、托管班情况',
            desc: '午餐费学年为每天18-22雷亚尔，Upper school阶段可自愿选择在校午餐或外出午餐。\n\n在校时间：\n周一、二、四、五：早上8:00到下午3:00\n周三：早上9:00到下午3:00\n\nK5及之后，学校设置了各种各样的课外活动（Club）,一般从下午3:00-4:00，课外活动额外收费。\n\n美国学校不设托管班，但父母如果临时有事不能接孩子，K3-K5阶段的孩子可以在低年级校长秘书办公室等候父母。'
          },
          {
            name: '7、位置及交通',
            desc: '位于南翼使馆区，距我馆车程5分钟，交通便利。'
          }
        ]
      },
      {
        category: '三、幼儿园阶段自费比例较高，可选择当地私立葡语学校如Marista，也可选择当地私立双语学校，包括Eleva、Mackenzie、Affinity Arts等。'
      },
      {
        category: 'Escola International Affinity Arts幼儿园简介',
        items: [{
            name: '1、学制',
            desc: '该学校只有幼儿园阶段课程，分为Maternal I e II（年满2-3岁儿童）、Jardim I（年满4岁儿童）和Jardim II（年满5岁儿童）三个阶段，每学年从1月开始，12月结束。每班12人。'
          },
          {
            name: '2、费用',
            desc: '每阶段都需缴纳基础费和学费，费用每年会根据通胀率等因素有所调整。全年学费约为40000-50000雷亚尔。'
          },
          {
            name: '3、主要课程',
            desc: '绘画、手工、音乐、英语、葡语等，无考试。'
          },
          {
            name: '4、入学需准备材料',
            desc: '居住证明、健康卡、出生证明、疫苗注射证明、血型证明、上一个学校的推荐信（如有）等。'
          },
          {
            name: '5、午餐、在校时间、托管班情况',
            desc: '学费含午餐餐费。Maternal I和II阶段每天在校时间为8:00-12:00；Jardim I阶段为8:00-13:30；Jardim II阶段为8:00-15:00。'
          },
          {
            name: '6、位置及交通',
            desc: '学校位于南湖区，距使馆车程15-20分钟，交通便利。'
          },
          {
            name: 'SHIS, QI09, Conjunto 16, nº07',
            desc: '地址',
            type: 'address',
            latitude: -15.8321,
            longitude: -47.8752
          },
          {
            name: '+55(61)3248-2966',
            desc: '联系电话',
            type: 'phone'
          },
          {
            name: 'www.affinityarts.com.br',
            desc: '官网',
            type: 'link'
          },
          {
            name: 'affinityarts@gmail.com',
            desc: '邮箱',
            type: 'email'
          }
        ]
      },
      {
        category: '四、学费报销\n按现行财务制度办理。'
      }
    ],

    // 7个按钮配置
    buttons: [{
        key: 'preparation',
        label: '行前准备',
        icon: '📋'
      },
      {
        key: 'shopping',
        label: '购物指南',
        icon: '🛒'
      },
      {
        key: 'chinese',
        label: '中餐、西餐及亚洲食材',
        icon: '🥢'
      },
      {
        key: 'online',
        label: '网购平台',
        icon: '📱'
      },
      {
        key: 'medical',
        label: '就医信息',
        icon: '🏥'
      },
      {
        key: 'transport',
        label: '交通信息',
        icon: '🚌'
      },
      {
        key: 'school',
        label: '子女就学',
        icon: '👧'
      },
      {
        key: 'bank',
        label: '银行账户',
        icon: '🏦'
      },
      {
        key: 'website',
        label: '常用网址',
        icon: '🖥️'
      },
      {
        key: 'arrived',
        label: '我已到馆',
        icon: '✅'
      }
    ]
  },

  onLoad() {
    // 获取状态栏高度（自定义导航栏需要）
    const systemInfo = wx.getWindowInfo()
    this.setData({
      statusBarHeight: systemInfo.statusBarHeight || 20
    })
    this.loadBgImage()

    // 验证用户角色
    app.checkUserRegistration().then((result) => {
      if (!result.registered || !result.user) {
        wx.reLaunch({
          url: '/pages/auth/login/login'
        })
        return
      } else if (result.user.role !== '待赴任馆员') {
        this.setData({
          //非'待赴任馆员'角色不显示‘行前准备’和‘我已到馆’按钮
          showArrivedButton: false,
          //导航栏文字改为‘常用信息’
          navTitle: '常用信息'
        })
      }
      // 非"待赴任馆员"角色也能查看，但仅"待赴任馆员"登录时自动跳转此页
    }).catch(() => {})
  },

  onShow() {
    const fontStyle = app.globalData.fontStyle
    if (this.data.fontStyle !== fontStyle) {
      this.setData({
        fontStyle
      })
    }
  },

  // 按钮点击
  handleButtonTap(e) {
    const key = e.currentTarget.dataset.key

    if (key === 'arrived') {
      this.handleArrived()
      return
    }

    const contentMap = {
      preparation: {
        title: '行前准备',
        type: 'checklist',
        content: this.data.checklistItems
      },
      shopping: {
        title: '购物指南',
        type: 'static',
        content: this.data.shoppingContent
      },
      chinese: {
        title: '中餐、西餐及亚洲食材',
        type: 'static',
        content: this.data.chineseContent
      },
      online: {
        title: '网购平台',
        type: 'static',
        content: this.data.shoppingOnlineContent
      },
      medical: {
        title: '就医信息（报销医院目录）',
        type: 'static',
        content: this.data.medicalContent
      },
      transport: {
        title: '交通信息',
        type: 'static',
        content: this.data.transportContent
      },
      school: {
        title: '子女就学',
        type: 'static',
        content: this.data.schoolContent
      },
      bank: {
        title: '银行账户',
        type: 'static',
        content: this.data.bankContent
      },
      website: {
        title: '常用网址',
        type: 'static',
        content: this.data.websiteContent
      }
    }

    const config = contentMap[key]
    if (!config) return

    this.setData({
      showPopup: true,
      popupAnimating: false,
      popupTitle: config.title,
      popupType: config.type,
      popupContent: config.content
    })
    wx.nextTick(() => {
      this.setData({
        popupAnimating: true
      })
    })
  },

  // checklist 打钩
  handleCheckToggle(e) {
    const id = e.currentTarget.dataset.id
    const checklistItems = this.data.checklistItems.map((item) => {
      if (item.id === id) {
        return {
          ...item,
          checked: !item.checked
        }
      }
      return item
    })
    const allChecked = checklistItems.every((item) => item.checked)
    const checkedCount = checklistItems.filter((item) => item.checked).length
    this.setData({
      checklistItems,
      allChecked,
      popupContent: checklistItems,
      checkedCount
    })
  },

  // 全选/取消全选
  handleCheckAll() {
    const allChecked = !this.data.allChecked
    const checklistItems = this.data.checklistItems.map((item) => ({
      ...item,
      checked: allChecked
    }))
    const checkedCount = allChecked ? checklistItems.length : 0
    this.setData({
      checklistItems,
      allChecked,
      popupContent: checklistItems,
      checkedCount
    })
  },

  // 关闭弹窗
  handleClosePopup() {
    this.setData({
      popupAnimating: false
    })
    setTimeout(() => {
      this.setData({
        showPopup: false
      })
    }, 300)
  },

  // 阻止冒泡
  stopPropagation() {},

  // 返回上一页
  handleGoBack() {
    wx.navigateBack({
      fail: () => {
        wx.switchTab({
          url: '/pages/office/home/home'
        })
      }
    })
  },

  // 我已到馆
  handleArrived() {
    wx.navigateTo({
      url: '/pages/office/profile/edit-profile/edit-profile'
    })
  },

  // 判断 name 的类型（link / phone / email / address / text）
  getItemType(name, type) {
    if (type) return type
    if (!name) return 'text'
    if (/^https?:\/\//i.test(name) || /^www\./i.test(name)) return 'link'
    if (/^[\+00]?\d[\d\s\-\(\)]{6,}$/.test(name)) return 'phone'
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(name)) return 'email'
    return 'text'
  },

  // 可点击项点击处理
  handleItemTap(e) {
    const {
      name,
      type
    } = e.currentTarget.dataset
    const itemType = this.getItemType(name, type)

    switch (itemType) {
      case 'link': {
        wx.setClipboardData({
          data: name,
          success() {
            wx.showToast({
              title: '链接已复制，请在浏览器中打开',
              icon: 'none'
            })
          }
        })
        break
      }
      case 'phone': {
        // 提取纯数字用于拨号
        const phoneNumber = name.replace(/[\s\-\(\)]/g, '')
        wx.makePhoneCall({
          phoneNumber
        })
        break
      }
      case 'email': {
        wx.setClipboardData({
          data: name,
          success() {
            wx.showToast({
              title: '邮箱已复制',
              icon: 'none'
            })
          }
        })
        break
      }
      case 'address': {
        const {
          latitude,
          longitude
        } = e.currentTarget.dataset
        if (latitude && longitude) {
          wx.openLocation({
            latitude: latitude,
            longitude: longitude,
            name: name,
            address: name,
            scale: 15
          })
        } else {
          wx.showToast({
            title: '该地址暂无坐标信息',
            icon: 'none'
          })
        }
        break
      }
    }
  },

  /**
   * 加载背景图片（优先使用本地持久缓存）
   */
  loadBgImage() {
    if (this.data.bgImageUrl) return
    utils.loadCachedCloudImage(
      this,
      'bgImageUrl',
      'cloud://cloud1-8gdftlggae64d5d0.636c-cloud1-8gdftlggae64d5d0-1390912780/images/br5.jpg',
      'bg_arrival.jpg'
    ).catch(err => {
      console.error('加载背景图片失败:', err)
    })
  }
})