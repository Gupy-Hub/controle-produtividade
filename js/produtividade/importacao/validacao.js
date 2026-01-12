Produtividade.Importacao = Produtividade.Importacao || {};

Produtividade.Importacao.Validacao = {
    
    mapaUsuariosPorNome: null,
    mapaUsuariosPorId: null,

    processar: async function(input) {
        if (!input.files || input.files.length === 0) return;

        const btn = input.nextElementSibling;
        const textoOriginal = btn ? btn.innerHTML : "Importar";
        if(btn) btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Lendo...';

        try {
            await this.carregarMapaUsuarios();

            let totalSucesso = 0;
            let totalIgnorados = 0;
            let ultimaData = null;

            for (let i = 0; i < input.files.length; i++) {
                const arquivo = input.files[i];
                console.log(`📂 Processando arquivo: ${arquivo.name}`);
                
                try {
                    // Passamos o nome do arquivo para tentar extrair a data de lá
                    const res = await this.processarArquivoIndividual(arquivo);
                    totalSucesso += res.importados;
                    totalIgnorados += res.ignorados.length;
                    if (res.ultimaData) ultimaData = res.ultimaData;
                    
                    if (res.ignorados.length > 0) {
                        console.warn(`⚠️ Arquivo ${arquivo.name}: ${res.ignorados.length} linhas ignoradas.`);
                    }
                } catch (err) {
                    console.error("Erro arquivo:", err);
                }
            }

            let msg = `Processamento concluído!\n\n✅ Importados: ${totalSucesso}\n⚠️ Ignorados: ${totalIgnorados}`;
            alert(msg);
            
            // Auto-Navegação
            if (ultimaData && Produtividade.mudarPeriodo) {
                const [anoImp, mesImp] = ultimaData.split('-');
                const selAno = document.getElementById('sel-ano');
                const selMes = document.getElementById('sel-mes');
                
                if(selAno && selMes) {
                    selAno.value = anoImp;
                    selMes.value = parseInt(mesImp) - 1;
                    console.log(`🔄 Indo para: ${mesImp}/${anoImp}`);
                    Produtividade.mudarPeriodo('mes'); 
                }
            } else if(Produtividade.Geral) {
                Produtividade.Geral.carregarTela();
            }

        } catch (erro) {
            console.error(erro);
            alert("Erro fatal: " + erro.message);
        } finally {
            input.value = ""; 
            if(btn) btn.innerHTML = textoOriginal;
        }
    },

    normalizarTexto: function(texto) {
        if (!texto) return "";
        return texto.toString().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
    },

    carregarMapaUsuarios: async function() {
        const { data } = await Sistema.supabase.from('usuarios').select('id, nome');
        this.mapaUsuariosPorNome = {};
        this.mapaUsuariosPorId = {};
        if(data) {
            data.forEach(u => {
                this.mapaUsuariosPorId[u.id] = u.id; 
                if(u.nome) this.mapaUsuariosPorNome[this.normalizarTexto(u.nome)] = u.id;
            });
        }
        console.log(`👥 Mapa carregado: ${data.length} usuários.`);
    },

    processarArquivoIndividual: function(arquivo) {
        return new Promise((resolve, reject) => {
            Papa.parse(arquivo, {
                header: true, skipEmptyLines: true, encoding: "UTF-8",
                transformHeader: h => h.trim().toLowerCase(),
                complete: async (results) => {
                    try { 
                        // Envia o nome do arquivo junto para extrair a data
                        resolve(await this.salvarDadosBanco(results.data, arquivo.name)); 
                    } 
                    catch (e) { reject(e); }
                },
                error: (err) => reject(new Error("Erro ao ler CSV"))
            });
        });
    },

    // Função auxiliar para extrair data do nome do arquivo (Ex: "01122025.csv")
    extrairDataDoNome: function(nomeArquivo) {
        try {
            // Procura padrao DDMMAAAA ou DD-MM-AAAA
            const match = nomeArquivo.match(/(\d{2})[-/]?(\d{2})[-/]?(\d{4})/);
            if (match) {
                const dia = match[1];
                const mes = match[2];
                const ano = match[3];
                return `${ano}-${mes}-${dia}`; // Formato ISO YYYY-MM-DD
            }
        } catch (e) { console.error("Erro data filename", e); }
        return null;
    },

    salvarDadosBanco: async function(linhas, nomeArquivo) {
        const payload = [];
        const ignorados = [];
        
        // 1. Tenta pegar data do nome do arquivo (Prioridade Alta para arquivos diários)
        const dataDoArquivo = this.extrairDataDoNome(nomeArquivo);
        let ultimaData = dataDoArquivo;

        for (const row of linhas) {
            // Identificação do Usuário
            let idCsvRaw = row['id'] || row['usuario_id'] || row['user_id'] || row['id_assistente'] || row['id_usuario'] || row['codigo'];
            const nomeCsv = row['assistente'] || row['nome'] || row['usuario'] || 'Desconhecido';
            
            if (nomeCsv.toLowerCase().includes('total') || nomeCsv.toLowerCase().includes('média')) continue;

            let usuarioIdFinal = null;
            if (idCsvRaw) {
                const idNum = parseInt(String(idCsvRaw).replace(/\D/g, ''));
                if (this.mapaUsuariosPorId[idNum]) usuarioIdFinal = idNum;
            }
            if (!usuarioIdFinal && nomeCsv !== 'Desconhecido') {
                const nomeNorm = this.normalizarTexto(nomeCsv);
                if (this.mapaUsuariosPorNome[nomeNorm]) usuarioIdFinal = this.mapaUsuariosPorNome[nomeNorm];
            }

            if (!usuarioIdFinal) {
                ignorados.push(nomeCsv);
                continue; 
            }

            // Identificação da Data (Arquivo > Coluna)
            let dataRef = dataDoArquivo;
            
            // Se não pegou do nome, tenta na linha
            if (!dataRef) {
                let rawData = row['data da auditoria'] || row['data'] || row['date'] || row['data_referencia'] || row['end_time'];
                if (rawData) {
                    if (rawData.includes('T')) dataRef = rawData.split('T')[0];
                    else if (rawData.includes('/')) {
                        const partes = rawData.split('/');
                        if(partes.length === 3) dataRef = `${partes[2]}-${partes[1]}-${partes[0]}`;
                    } else if (rawData.includes('-')) {
                        dataRef = rawData;
                    }
                }
            }
            
            if (!dataRef) {
                // Sem data, impossível importar
                continue;
            }
            ultimaData = dataRef;

            // Valores
            const clean = (v) => v ? parseInt(String(v).replace(/\./g,'')) || 0 : 0;
            const qtd = clean(row['quantidade_documentos_validados'] || row['quantidade'] || row['qtd'] || row['producao']);
            
            // Qualidade
            const qtdOk = clean(row['ok']);
            const qtdNok = clean(row['nok']);
            let assertTxt = '0%';
            if (qtdOk + qtdNok > 0) {
                assertTxt = ((qtdOk / (qtdOk + qtdNok)) * 100).toFixed(1) + '%';
            }

            // FIFO
            const isFifo = (row['fila'] || '').toString().toLowerCase().includes('fifo');
            const valFifo = isFifo ? qtd : clean(row['fifo']);

            payload.push({
                usuario_id: usuarioIdFinal,
                data_referencia: dataRef,
                quantidade: qtd,
                fifo: valFifo,
                gradual_total: 0, gradual_parcial: 0, perfil_fc: 0, fator: 1,
                nok: qtdNok.toString(),
                assertividade: assertTxt
            });
        }

        if (payload.length > 0) {
            // Evita duplicidade limpando o dia antes de inserir
            const datasParaLimpar = [...new Set(payload.map(p => p.data_referencia))];
            
            // Tenta deletar (Se falhar não para o processo, pois o insert trata erros depois)
            await Sistema.supabase.from('producao').delete().in('data_referencia', datasParaLimpar);

            // Insere
            const loteSize = 1000;
            for (let i = 0; i < payload.length; i += loteSize) {
                const lote = payload.slice(i, i + loteSize);
                const { error } = await Sistema.supabase.from('producao').insert(lote);
                if (error) {
                    console.error("Erro insert:", error);
                    throw new Error("Falha de gravação no banco.");
                }
            }
        }

        return { importados: payload.length, ignorados: ignorados, ultimaData: ultimaData };
    }
};