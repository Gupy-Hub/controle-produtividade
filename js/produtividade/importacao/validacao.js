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
                    const res = await this.processarArquivoIndividual(arquivo);
                    totalSucesso += res.importados;
                    totalIgnorados += res.ignorados.length;
                    if (res.ultimaData) ultimaData = res.ultimaData;
                    
                    if (res.ignorados.length > 0) {
                        console.warn("⚠️ Linhas ignoradas neste arquivo:", res.ignorados);
                    }
                } catch (err) {
                    console.error("Erro arquivo:", err);
                    alert(`Erro no arquivo ${arquivo.name}: ${err.message}`);
                }
            }

            // Feedback
            let msg = `Processamento concluído!\n\n✅ Importados: ${totalSucesso}\n⚠️ Ignorados: ${totalIgnorados}`;
            if (totalIgnorados > 0) msg += `\n(Verifique o Console F12 para ver quais linhas falharam)`;
            alert(msg);
            
            // Auto-Navegação para a data do arquivo
            if (ultimaData && Produtividade.mudarPeriodo) {
                const [anoImp, mesImp] = ultimaData.split('-');
                const selAno = document.getElementById('sel-ano');
                const selMes = document.getElementById('sel-mes');
                
                if(selAno && selMes) {
                    selAno.value = anoImp;
                    selMes.value = parseInt(mesImp) - 1;
                    console.log(`🔄 Indo para data importada: ${mesImp}/${anoImp}`);
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
        console.log(`👥 Mapa carregado: ${data.length} usuários encontrados no sistema.`);
    },

    processarArquivoIndividual: function(arquivo) {
        return new Promise((resolve, reject) => {
            Papa.parse(arquivo, {
                header: true, skipEmptyLines: true, encoding: "UTF-8",
                transformHeader: h => h.trim().toLowerCase(), // Normaliza cabeçalhos para minúsculo
                complete: async (results) => {
                    try { resolve(await this.salvarDadosBanco(results.data)); } 
                    catch (e) { reject(e); }
                },
                error: (err) => reject(new Error("Erro ao ler CSV"))
            });
        });
    },

    salvarDadosBanco: async function(linhas) {
        const payload = [];
        const ignorados = [];
        let ultimaData = null;

        // Debug dos cabeçalhos encontrados na primeira linha
        if (linhas.length > 0) {
            console.log("📋 Cabeçalhos detectados no CSV:", Object.keys(linhas[0]));
        }

        for (const row of linhas) {
            // 1. ESTRATÉGIA DE ID (PRIORIDADE MÁXIMA)
            // Procura em todas as variações possíveis de nome de coluna de ID
            let idCsvRaw = row['id'] || row['usuario_id'] || row['user_id'] || row['id_assistente'] || row['id_usuario'] || row['codigo'] || row['matricula'];
            
            // Estratégia de Nome (Fallback)
            const nomeCsv = row['assistente'] || row['nome'] || row['usuario'] || row['funcionario'] || 'Desconhecido';
            
            // Pula linhas de lixo (totais, médias)
            if (nomeCsv.toLowerCase().includes('total') || nomeCsv.toLowerCase().includes('média')) continue;

            let usuarioIdFinal = null;

            // Tenta validar o ID numérico encontrado
            if (idCsvRaw) {
                const idNum = parseInt(String(idCsvRaw).replace(/\D/g, '')); // Remove letras, deixa só números
                
                // Verifica se esse ID existe no banco
                if (this.mapaUsuariosPorId[idNum]) {
                    usuarioIdFinal = idNum;
                } else {
                    // ID existe no CSV, mas não no banco.
                    // console.warn(`ID ${idNum} do CSV não encontrado no banco.`);
                }
            }

            // Se não achou por ID, tenta por Nome
            if (!usuarioIdFinal && nomeCsv !== 'Desconhecido') {
                const nomeNorm = this.normalizarTexto(nomeCsv);
                if (this.mapaUsuariosPorNome[nomeNorm]) {
                    usuarioIdFinal = this.mapaUsuariosPorNome[nomeNorm];
                }
            }

            // SE FALHAR TUDO, IGNORA EAVISA
            if (!usuarioIdFinal) {
                ignorados.push(`Nome: ${nomeCsv} | ID: ${idCsvRaw || 'N/A'}`);
                continue; 
            }

            // 2. ESTRATÉGIA DE DATA
            let dataRef = null;
            let rawData = row['data da auditoria'] || row['data'] || row['date'] || row['data_referencia'] || row['end_time'];
            
            if (rawData) {
                if (rawData.includes('T')) dataRef = rawData.split('T')[0];
                else if (rawData.includes('/')) {
                    const partes = rawData.split('/'); // DD/MM/AAAA
                    if(partes.length === 3) dataRef = `${partes[2]}-${partes[1]}-${partes[0]}`;
                } else if (rawData.includes('-')) {
                    dataRef = rawData;
                }
            }
            
            if (!dataRef) {
                // Se não tem data na linha, tenta inferir (opcional, aqui pulamos)
                continue;
            }
            ultimaData = dataRef;

            // 3. VALORES E QUALIDADE
            const clean = (v) => v ? parseInt(String(v).replace(/\./g,'')) || 0 : 0;
            const qtd = clean(row['quantidade_documentos_validados'] || row['quantidade'] || row['qtd'] || row['producao']);
            
            // Colunas de Qualidade
            const qtdOk = clean(row['ok']);
            const qtdNok = clean(row['nok']);
            
            let assertTxt = '0%';
            if (qtdOk + qtdNok > 0) {
                assertTxt = ((qtdOk / (qtdOk + qtdNok)) * 100).toFixed(1) + '%';
            }

            // Coluna FIFO
            const isFifo = (row['fila'] || '').toString().toLowerCase().includes('fifo');
            const valFifo = isFifo ? qtd : clean(row['fifo']);

            payload.push({
                usuario_id: usuarioIdFinal,
                data_referencia: dataRef,
                quantidade: qtd,
                fifo: valFifo,
                gradual_total: 0,
                gradual_parcial: 0,
                perfil_fc: 0,
                fator: 1,
                nok: qtdNok.toString(),
                assertividade: assertTxt
            });
        }

        if (payload.length > 0) {
            // Limpa dados anteriores das datas envolvidas (para não duplicar)
            const datasParaLimpar = [...new Set(payload.map(p => p.data_referencia))];
            
            // IMPORTANTE: Deleta usando RPC para evitar timeout se for muito dado, 
            // ou delete normal se for pouco. Vamos usar delete normal com filtro 'in' que é seguro para lotes.
            await Sistema.supabase.from('producao').delete().in('data_referencia', datasParaLimpar);

            // Insere em lotes de 1000
            const loteSize = 1000;
            for (let i = 0; i < payload.length; i += loteSize) {
                const lote = payload.slice(i, i + loteSize);
                const { error } = await Sistema.supabase.from('producao').insert(lote);
                if (error) {
                    console.error("Erro insert Supabase:", error);
                    throw new Error("Falha ao gravar no banco de dados.");
                }
            }
        }

        return { importados: payload.length, ignorados: ignorados, ultimaData: ultimaData };
    }
};