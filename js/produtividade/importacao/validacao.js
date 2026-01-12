Produtividade.Importacao = Produtividade.Importacao || {};

Produtividade.Importacao.Validacao = {
    
    mapaUsuariosPorNome: null,
    mapaUsuariosPorId: null,

    processar: async function(input) {
        if (!input.files || input.files.length === 0) return;

        const btn = input.nextElementSibling;
        const textoOriginal = btn ? btn.innerHTML : "Importar";
        if(btn) btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processando...';

        try {
            await this.carregarMapaUsuarios();

            let totalSucesso = 0;
            let totalIgnorados = 0;
            let ultimaDataEncontrada = null; // Para redirecionar o calendário

            for (let i = 0; i < input.files.length; i++) {
                const arquivo = input.files[i];
                try {
                    const res = await this.processarArquivoIndividual(arquivo);
                    totalSucesso += res.importados;
                    totalIgnorados += res.ignorados.length;
                    if(res.ultimaData) ultimaDataEncontrada = res.ultimaData;
                } catch (err) {
                    console.error("Erro arquivo:", err);
                    alert(`Erro no arquivo ${arquivo.name}: ${err.message}`);
                }
            }

            alert(`Importação concluída!\n\n✅ Sucesso: ${totalSucesso} registros.\n⚠️ Ignorados: ${totalIgnorados} (linhas sem nome/ID válido).`);
            
            // --- AUTO-NAVEGAÇÃO (CORREÇÃO DE UX) ---
            if (ultimaDataEncontrada && Produtividade.mudarPeriodo) {
                // Descobre ano e mês da importação
                const [anoImp, mesImp] = ultimaDataEncontrada.split('-');
                
                // Atualiza os seletores da interface principal
                const selAno = document.getElementById('sel-ano');
                const selMes = document.getElementById('sel-mes');
                
                if(selAno && selMes) {
                    selAno.value = anoImp;
                    selMes.value = parseInt(mesImp) - 1; // JS usa meses 0-11
                    
                    // Força a atualização da tela
                    console.log(`🔄 Redirecionando visão para: ${mesImp}/${anoImp}`);
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
    },

    processarArquivoIndividual: function(arquivo) {
        return new Promise((resolve, reject) => {
            Papa.parse(arquivo, {
                header: true, skipEmptyLines: true, encoding: "UTF-8",
                transformHeader: h => h.trim(),
                complete: async (results) => {
                    try { resolve(await this.salvarDadosBanco(results.data)); } 
                    catch (e) { reject(e); }
                },
                error: (err) => reject(new Error("Erro CSV"))
            });
        });
    },

    salvarDadosBanco: async function(linhas) {
        const payload = [];
        const ignorados = [];
        let ultimaData = null;

        for (const row of linhas) {
            const nomeCsv = row['Assistente'] || row['nome'] || 'Desconhecido';
            const idCsvRaw = row['id_assistente'] || row['ID Usuario'];
            
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

            let dataRef = null;
            // Tenta detectar a coluna de data
            let rawData = row['Data da Auditoria'] || row['Data'] || row['data'] || row['end_time'];
            
            if (rawData) {
                if (rawData.includes('T')) dataRef = rawData.split('T')[0]; // ISO
                else if (rawData.includes('/')) { // BR DD/MM/AAAA
                    const partes = rawData.split('/');
                    if(partes.length === 3) dataRef = `${partes[2]}-${partes[1]}-${partes[0]}`;
                } else if (rawData.includes('-')) {
                    dataRef = rawData;
                }
            }
            
            if (!dataRef) continue;
            ultimaData = dataRef;

            const clean = (v) => v ? parseInt(String(v).replace(/\./g,'')) || 0 : 0;
            const qtd = clean(row['Quantidade_documentos_validados'] || row['quantidade']);
            const qtdOk = clean(row['Ok']);
            const qtdNok = clean(row['Nok']);
            
            let assertTxt = '0%';
            if (qtdOk + qtdNok > 0) {
                assertTxt = ((qtdOk / (qtdOk + qtdNok)) * 100).toFixed(1) + '%';
            }

            payload.push({
                usuario_id: usuarioIdFinal,
                data_referencia: dataRef,
                quantidade: qtd,
                fifo: clean(row['Fila'] === 'FIFO' ? qtd : 0),
                gradual_total: 0, gradual_parcial: 0, perfil_fc: 0, fator: 1,
                nok: qtdNok.toString(),
                assertividade: assertTxt
            });
        }

        if (payload.length > 0) {
            // Remove dados do dia para evitar duplicidade (Clean Insert)
            // Agrupa datas para deletar em lote
            const datasParaLimpar = [...new Set(payload.map(p => p.data_referencia))];
            
            // Deleta
            await Sistema.supabase.from('producao').delete().in('data_referencia', datasParaLimpar);

            // Insere em lotes
            const loteSize = 1000;
            for (let i = 0; i < payload.length; i += loteSize) {
                const lote = payload.slice(i, i + loteSize);
                const { error } = await Sistema.supabase.from('producao').insert(lote);
                if (error) {
                    console.error("Erro insert:", error);
                    throw new Error("Erro ao salvar dados no banco.");
                }
            }
        }

        return { importados: payload.length, ignorados: ignorados, ultimaData: ultimaData };
    }
};