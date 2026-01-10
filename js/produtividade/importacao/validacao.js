Produtividade.Importacao = Produtividade.Importacao || {};

Produtividade.Importacao.Validacao = {
    
    mapaUsuarios: null,

    processar: async function(input) {
        if (!input.files || input.files.length === 0) return;

        const btnTextoOriginal = input.nextElementSibling ? input.nextElementSibling.innerHTML : "Importar";
        if(input.nextElementSibling) input.nextElementSibling.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processando...';

        try {
            // 1. Carrega usuários do banco com normalização
            await this.carregarMapaUsuarios();

            let arquivosSucesso = 0;
            let totalRegistrosImportados = 0;
            let relatorioIgnorados = []; // Lista para acumular quem ficou de fora
            let errosCriticos = [];

            // 2. Loop por cada arquivo selecionado
            for (let i = 0; i < input.files.length; i++) {
                const arquivo = input.files[i];
                try {
                    const resultado = await this.processarArquivoIndividual(arquivo);
                    arquivosSucesso++;
                    totalRegistrosImportados += resultado.importados;
                    
                    if (resultado.ignorados && resultado.ignorados.length > 0) {
                        // Adiciona ao relatório identificando o arquivo
                        resultado.ignorados.forEach(nome => {
                            relatorioIgnorados.push(`${nome} (em ${arquivo.name})`);
                        });
                    }
                } catch (err) {
                    console.error(`Erro no arquivo ${arquivo.name}:`, err);
                    errosCriticos.push(`${arquivo.name}: ${err.message}`);
                }
            }

            // 3. Relatório Final Detalhado
            let msg = `Processamento concluído!\n`;
            msg += `✅ ${arquivosSucesso} arquivos processados.\n`;
            msg += `📊 ${totalRegistrosImportados} registros salvos no banco.\n`;

            if (relatorioIgnorados.length > 0) {
                msg += `\n⚠️ ATENÇÃO: ${relatorioIgnorados.length} assistentes da planilha não foram encontrados no banco:\n`;
                // Mostra os primeiros 10 para não estourar a tela
                msg += relatorioIgnorados.slice(0, 10).map(n => ` - ${n}`).join('\n');
                if (relatorioIgnorados.length > 10) msg += `\n... e mais ${relatorioIgnorados.length - 10}.`;
                msg += `\n\nDICA: Verifique se o nome no banco está IDÊNTICO (Acentos são ignorados).`;
            }

            if (errosCriticos.length > 0) {
                msg += `\n\n❌ Erros Críticos:\n` + errosCriticos.join('\n');
            }

            alert(msg);

            // Atualiza a tela (recarrega os dados da data que estiver no input global)
            if(Produtividade.Geral) Produtividade.Geral.carregarTela();

        } catch (erroGeral) {
            console.error(erroGeral);
            alert("Erro crítico no processo de importação: " + erroGeral.message);
        } finally {
            input.value = ""; 
            if(input.nextElementSibling) input.nextElementSibling.innerHTML = btnTextoOriginal;
        }
    },

    // Função auxiliar para remover acentos e deixar minúsculo
    // Ex: "Samária Teixeira" -> "samaria teixeira"
    normalizarTexto: function(texto) {
        if (!texto) return "";
        return texto
            .toString()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "") // Remove acentos
            .toLowerCase()
            .trim();
    },

    carregarMapaUsuarios: async function() {
        // Sempre recarrega para garantir que pegamos usuários recém criados
        const { data, error } = await Sistema.supabase.from('usuarios').select('id, nome');
        if (error) throw error;

        this.mapaUsuarios = {};
        
        data.forEach(u => {
            if(u.nome) {
                // Cria chaves normalizadas para busca fácil
                const chave = this.normalizarTexto(u.nome);
                this.mapaUsuarios[chave] = u.id;
            }
        });
        
        console.log(`Mapa de usuários carregado: ${Object.keys(this.mapaUsuarios).length} usuários encontrados.`);
    },

    processarArquivoIndividual: function(arquivo) {
        return new Promise((resolve, reject) => {
            // Valida Nome (ddmmaaaa.csv)
            const nomeLimpo = arquivo.name.split('.')[0];
            const regexData = /^(\d{2})(\d{2})(\d{4})$/;
            const match = nomeLimpo.match(regexData);

            if (!match) {
                reject(new Error("Nome inválido. Use formato ddmmaaaa.csv (Ex: 01122025.csv)"));
                return;
            }

            const dia = match[1];
            const mes = match[2];
            const ano = match[3];
            const dataReferencia = `${ano}-${mes}-${dia}`;

            // Parse CSV
            Papa.parse(arquivo, {
                header: true,
                skipEmptyLines: true, 
                complete: async (results) => {
                    try {
                        const resultadoBanco = await this.salvarDadosBanco(results.data, dataReferencia);
                        resolve(resultadoBanco); // Retorna { importados: X, ignorados: [...] }
                    } catch (e) {
                        reject(e);
                    }
                },
                error: (err) => reject(new Error("Erro ao ler CSV"))
            });
        });
    },

    salvarDadosBanco: async function(linhas, dataRef) {
        const payload = [];
        const ignoradosNesteArquivo = [];

        for (const row of linhas) {
            // 1. Pular linhas inválidas ou de Total
            if (!row.id_assistente && !row.assistente) continue; 
            if (row.assistente && row.assistente.trim() === 'Total') continue;
            if (!row.id_assistente && row.assistente === 'Total') continue;

            const nomeCsv = row.assistente ? row.assistente.trim() : '';
            if (!nomeCsv) continue;

            // 2. Busca ID no mapa usando NORMALIZAÇÃO
            // Agora "Samária" acha "Samaria" e vice-versa
            const nomeNormalizado = this.normalizarTexto(nomeCsv);
            const usuarioId = this.mapaUsuarios[nomeNormalizado];

            if (!usuarioId) {
                console.warn(`[Importação ${dataRef}] Usuário não encontrado: "${nomeCsv}" (Norm: "${nomeNormalizado}")`);
                ignoradosNesteArquivo.push(nomeCsv);
                continue; 
            }

            const limparNum = (val) => {
                if (!val) return 0;
                return parseInt(String(val).replace(/\./g, '')) || 0;
            };

            payload.push({
                usuario_id: usuarioId,
                data_referencia: dataRef,
                quantidade: limparNum(row.documentos_validados),
                fifo: limparNum(row.documentos_validados_fifo),
                gradual_total: limparNum(row.documentos_validados_gradual_total),
                gradual_parcial: limparNum(row.documentos_validados_gradual_parcial),
                perfil_fc: limparNum(row.documentos_validados_perfil_fc),
                fator: 1
            });
        }

        if (payload.length === 0) {
            // Se só tinha nomes errados ou linhas vazias
            return { importados: 0, ignorados: ignoradosNesteArquivo };
        }

        // Transação: Remove dia existente -> Insere novos
        const { error: errDel } = await Sistema.supabase
            .from('producao')
            .delete()
            .eq('data_referencia', dataRef);
        
        if (errDel) throw new Error("Erro ao limpar dados antigos: " + errDel.message);

        const { error: errIns } = await Sistema.supabase
            .from('producao')
            .insert(payload);

        if (errIns) throw new Error("Erro ao inserir no banco: " + errIns.message);

        return { importados: payload.length, ignorados: ignoradosNesteArquivo };
    }
};