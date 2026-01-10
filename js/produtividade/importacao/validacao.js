Produtividade.Importacao = Produtividade.Importacao || {};

Produtividade.Importacao.Validacao = {
    
    // Cache de usuários para não buscar no banco a cada arquivo
    mapaUsuarios: null,

    processar: async function(input) {
        if (!input.files || input.files.length === 0) return;

        const btnTextoOriginal = input.nextElementSibling ? input.nextElementSibling.innerHTML : "Importar";
        if(input.nextElementSibling) input.nextElementSibling.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processando...';

        try {
            // 1. Carrega usuários do banco UMA VEZ só para otimizar
            await this.carregarMapaUsuarios();

            let arquivosSucesso = 0;
            let erros = [];

            // 2. Loop por cada arquivo selecionado
            for (let i = 0; i < input.files.length; i++) {
                const arquivo = input.files[i];
                try {
                    await this.processarArquivoIndividual(arquivo);
                    arquivosSucesso++;
                } catch (err) {
                    console.error(`Erro no arquivo ${arquivo.name}:`, err);
                    erros.push(`${arquivo.name}: ${err.message}`);
                }
            }

            // 3. Relatório Final
            let msg = `Processamento concluído!\n${arquivosSucesso} arquivos importados com sucesso.`;
            if (erros.length > 0) {
                msg += `\n\nErros (${erros.length}):\n` + erros.join('\n');
            }
            alert(msg);

            // Atualiza a tela (recarrega os dados da data que estiver no input global)
            if(Produtividade.Geral) Produtividade.Geral.carregarTela();

        } catch (erroGeral) {
            console.error(erroGeral);
            alert("Erro crítico no processo de importação: " + erroGeral.message);
        } finally {
            input.value = ""; // Limpa o input para permitir selecionar os mesmos arquivos de novo se precisar
            if(input.nextElementSibling) input.nextElementSibling.innerHTML = btnTextoOriginal;
        }
    },

    carregarMapaUsuarios: async function() {
        if (this.mapaUsuarios) return; // Já carregado

        const { data, error } = await Sistema.supabase.from('usuarios').select('id, nome');
        if (error) throw error;

        this.mapaUsuarios = {};
        // Normaliza nomes para minúsculo para facilitar o "match"
        data.forEach(u => {
            if(u.nome) this.mapaUsuarios[u.nome.trim().toLowerCase()] = u.id;
        });
    },

    processarArquivoIndividual: function(arquivo) {
        return new Promise((resolve, reject) => {
            // Valida Nome (ddmmaaaa.csv)
            const nomeLimpo = arquivo.name.split('.')[0];
            const regexData = /^(\d{2})(\d{2})(\d{4})$/;
            const match = nomeLimpo.match(regexData);

            if (!match) {
                reject(new Error("Nome inválido. Use formato ddmmaaaa.csv"));
                return;
            }

            const dia = match[1];
            const mes = match[2];
            const ano = match[3];
            const dataReferencia = `${ano}-${mes}-${dia}`;

            // Parse CSV
            Papa.parse(arquivo, {
                header: true,
                skipEmptyLines: true, // Pula linhas totalmente vazias
                complete: async (results) => {
                    try {
                        await this.salvarDadosBanco(results.data, dataReferencia);
                        resolve();
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

        for (const row of linhas) {
            // LÓGICA DE LIMPEZA DO CSV
            // Ignora se não tiver ID ou se o nome for "Total" (linha de cabeçalho/lixo da planilha)
            if (!row.id_assistente && !row.assistente) continue; 
            if (row.assistente && row.assistente.trim() === 'Total') continue;
            if (!row.id_assistente && row.assistente === 'Total') continue; // Caso específico do CSV enviado

            const nomeCsv = row.assistente ? row.assistente.trim() : '';
            if (!nomeCsv) continue;

            // Busca ID no mapa
            const usuarioId = this.mapaUsuarios[nomeCsv.toLowerCase()];

            if (!usuarioId) {
                console.warn(`[Importação ${dataRef}] Usuário não encontrado no banco: "${nomeCsv}". Ignorando.`);
                continue; 
            }

            // Função helper para limpar números (remove pontos de milhar se houver)
            const limparNum = (val) => {
                if (!val) return 0;
                // Se vier "1.234", remove ponto -> "1234". Se vier "1,234", cuidado. 
                // Assumindo CSV padrão excel BR ou US simples sem aspas.
                // O snippet mostra numeros inteiros simples: 5521, 420.
                return parseInt(String(val).replace(/\./g, '')) || 0;
            };

            payload.push({
                usuario_id: usuarioId,
                data_referencia: dataRef,
                // Mapeamento exato das colunas do seu CSV
                quantidade: limparNum(row.documentos_validados), // Coluna G
                fifo: limparNum(row.documentos_validados_fifo), // Coluna C
                gradual_total: limparNum(row.documentos_validados_gradual_total), // Coluna D
                gradual_parcial: limparNum(row.documentos_validados_gradual_parcial), // Coluna E
                perfil_fc: limparNum(row.documentos_validados_perfil_fc), // Coluna F
                fator: 1 // Default
            });
        }

        if (payload.length === 0) {
            throw new Error("Nenhum registro válido encontrado (verifique nomes dos usuários).");
        }

        // Transação: Remove dia existente -> Insere novos
        
        // 1. Delete prévio (limpeza do dia)
        const { error: errDel } = await Sistema.supabase
            .from('producao')
            .delete()
            .eq('data_referencia', dataRef);
        
        if (errDel) throw new Error("Erro ao limpar dados antigos: " + errDel.message);

        // 2. Insert em massa
        const { error: errIns } = await Sistema.supabase
            .from('producao')
            .insert(payload);

        if (errIns) throw new Error("Erro ao inserir no banco: " + errIns.message);
    }
};