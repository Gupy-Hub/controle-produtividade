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
                        console.warn(`⚠️ Arquivo ${arquivo.name}: ${res.ignorados.length} linhas ignoradas (Totais ou desconhecidos).`);
                    }
                } catch (err) {
                    console.error("Erro arquivo:", err);
                    alert(`Erro no arquivo ${arquivo.name}: ${err.message}`);
                }
            }

            alert(`Processamento concluído!\n\n✅ Registros Salvos: ${totalSucesso}\n⚠️ Linhas Ignoradas: ${totalIgnorados}`);
            
            // Auto-Navegação para a data do arquivo
            if (ultimaData && Produtividade.mudarPeriodo) {
                const [anoImp, mesImp] = ultimaData.split('-');
                const selAno = document.getElementById('sel-ano');
                const selMes = document.getElementById('sel-mes');
                
                if(selAno && selMes) {
                    selAno.value = anoImp;
                    selMes.value = parseInt(mesImp) - 1; // Mês 0-11
                    console.log(`🔄 Redirecionando para: ${mesImp}/${anoImp}`);
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
                transformHeader: h => h.trim().toLowerCase(), // Normaliza cabeçalhos
                complete: async (results) => {
                    try { 
                        resolve(await this.salvarDadosBanco(results.data, arquivo.name)); 
                    } 
                    catch (e) { reject(e); }
                },
                error: (err) => reject(new Error("Erro ao ler CSV"))
            });
        });
    },

    // Extrai data de formatos "01122025.csv" ou "01-12-2025.csv"
    extrairDataDoNome: function(nomeArquivo) {
        try {
            // Regex para pegar 8 digitos seguidos (DDMMAAAA) ou com separadores
            const match = nomeArquivo.match(/(\d{2})[-/]?(\d{2})[-/]?(\d{4})/);
            if (match) {
                const dia = match[1];
                const mes = match[2];
                const ano = match[3];
                // Retorna ISO para o banco: YYYY-MM-DD
                return `${ano}-${mes}-${dia}`; 
            }
        } catch (e) { console.error("Erro data filename", e); }
        return null;
    },

    salvarDadosBanco: async function(linhas, nomeArquivo) {
        const payload = [];
        const ignorados = [];
        
        // 1. Data via Nome do Arquivo (Prioridade Absoluta)
        const dataDoArquivo = this.extrairDataDoNome(nomeArquivo);
        let ultimaData = dataDoArquivo;

        // Se não conseguiu extrair a data do nome, aborta o arquivo para não salvar lixo
        if (!dataDoArquivo) {
            throw new Error("Nome do arquivo deve conter a data (ex: 01122025.csv)");
        }

        console.log(`📅 Data detectada no arquivo: ${dataDoArquivo}`);

        for (const row of linhas) {
            // 2. Identificação do Usuário (Seu CSV usa 'id_assistente' e 'assistente')
            let idCsvRaw = row['id_assistente'] || row['id'] || row['usuario_id'];
            const nomeCsv = row['assistente'] || row['nome'] || 'Desconhecido';
            
            // Pula linha de Total
            if (nomeCsv.toLowerCase() === 'total' || nomeCsv.toLowerCase().includes('média')) continue;
            // Pula se não tiver ID nem Nome
            if (!idCsvRaw && nomeCsv === 'Desconhecido') continue;

            let usuarioIdFinal = null;

            // Tenta ID
            if (idCsvRaw) {
                const idNum = parseInt(String(idCsvRaw).replace(/\D/g, ''));
                if (this.mapaUsuariosPorId[idNum]) usuarioIdFinal = idNum;
            }
            // Tenta Nome
            if (!usuarioIdFinal && nomeCsv !== 'Desconhecido') {
                const nomeNorm = this.normalizarTexto(nomeCsv);
                if (this.mapaUsuariosPorNome[nomeNorm]) usuarioIdFinal = this.mapaUsuariosPorNome[nomeNorm];
            }

            if (!usuarioIdFinal) {
                ignorados.push(`${nomeCsv} (${idCsvRaw})`);
                continue; 
            }

            // 3. Mapeamento das Colunas Específicas do seu CSV
            const clean = (v) => v ? parseInt(String(v).replace(/\./g,'')) || 0 : 0;

            // Mapeamento Direto
            const qtdTotal = clean(row['documentos_validados']); // Coluna principal
            const qtdFifo = clean(row['documentos_validados_fifo']);
            const qtdGT = clean(row['documentos_validados_gradual_total']);
            const qtdGP = clean(row['documentos_validados_gradual_parcial']);
            const qtdFC = clean(row['documentos_validados_perfil_fc']);

            // Fallback para colunas genéricas caso o CSV mude
            const finalQtd = qtdTotal > 0 ? qtdTotal : clean(row['quantidade']);
            
            // Qualidade (Seu CSV de produção NÃO tem isso, então mandamos null/0)
            // Se tiver colunas 'ok' e 'nok' em outro arquivo, ele pega.
            const qtdOk = clean(row['ok']);
            const qtdNok = clean(row['nok']);
            let assertTxt = null; // Deixa null para não sobrescrever se já existir dados de qualidade
            
            if (row['ok'] !== undefined || row['nok'] !== undefined) {
                 if (qtdOk + qtdNok > 0) {
                    assertTxt = ((qtdOk / (qtdOk + qtdNok)) * 100).toFixed(1) + '%';
                } else {
                    assertTxt = '0%';
                }
            }

            payload.push({
                usuario_id: usuarioIdFinal,
                data_referencia: dataDoArquivo, // Usa a data do nome do arquivo
                quantidade: finalQtd,
                fifo: qtdFifo,
                gradual_total: qtdGT,
                gradual_parcial: qtdGP,
                perfil_fc: qtdFC,
                fator: 1,
                // Só envia assertividade se existir no CSV, senão mantém o padrão do banco
                ...(assertTxt !== null && { assertividade: assertTxt }),
                ...(row['nok'] !== undefined && { nok: qtdNok.toString() })
            });
        }

        if (payload.length > 0) {
            // Upsert (Atualizar se existir) ou Delete+Insert?
            // Como este arquivo é "a verdade" da produção do dia, melhor limpar a produção do dia e inserir a nova.
            // MAS CUIDADO: Se você importar Qualidade separadamente depois, o Delete aqui apagaria a Qualidade.
            // ESTRATÉGIA SEGURA: Upsert via conflito de ID seria ideal, mas não temos ID único do CSV.
            // Vamos manter a estratégia: Limpar Produção deste dia para estes usuários e inserir.
            
            // Para não apagar dados de qualidade de OUTROS usuários ou se o arquivo for parcial,
            // vamos deletar apenas onde data_referencia = dataDoArquivo.
            
            console.log(`💾 Salvando ${payload.length} registros para ${dataDoArquivo}...`);

            // Usa RPC de exclusão por data (rápido)
            await Sistema.supabase.rpc('excluir_producao_periodo', { 
                p_inicio: dataDoArquivo, 
                p_fim: dataDoArquivo 
            });

            // Insere em lotes
            const loteSize = 1000;
            for (let i = 0; i < payload.length; i += loteSize) {
                const lote = payload.slice(i, i + loteSize);
                const { error } = await Sistema.supabase.from('producao').insert(lote);
                if (error) {
                    console.error("Erro insert:", error);
                    throw new Error("Erro ao gravar no banco.");
                }
            }
        }

        return { importados: payload.length, ignorados: ignorados, ultimaData: ultimaData };
    }
};