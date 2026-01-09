window.Gestao = window.Gestao || {};
window.Gestao.Importacao = window.Gestao.Importacao || {};

Gestao.Importacao.Assertividade = {
    executar: async function(input) {
        if (!input.files || !input.files[0]) return;
        const file = input.files[0];

        // Feedback Visual
        const btnLabel = input.parentElement;
        const originalHtml = btnLabel.innerHTML;
        btnLabel.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processando...';
        btnLabel.classList.add('opacity-50', 'cursor-not-allowed');

        try {
            // 1. Carrega dados auxiliares para cruzamento (JOIN manual)
            const { data: usersData } = await Sistema.supabase.from('usuarios').select('id, nome');
            const { data: empData } = await Sistema.supabase.from('empresas').select('id, nome, subdominio');

            // Cria Mapas para busca rápida (Nome -> ID)
            const mapUsuarios = {};
            usersData.forEach(u => mapUsuarios[this.normalizar(u.nome)] = u.id);

            const mapEmpresas = {};
            empData.forEach(e => {
                mapEmpresas[this.normalizar(e.nome)] = e; // Busca por Nome
                if(e.subdominio) mapEmpresas[this.normalizar(e.subdominio)] = e; // Busca por Subdomínio
            });

            // 2. Lê a Planilha
            const linhas = await Gestao.lerArquivo(file);
            const inserts = [];
            let naoEncontrados = new Set();

            for (const row of linhas) {
                const c = {};
                // Normaliza chaves do CSV para facilitar
                Object.keys(row).forEach(k => c[this.normalizarKey(k)] = row[k]);

                // Campos Essenciais
                const nomeAssist = c['assistente'] || c['usuario'] || '';
                const nomeEmpresa = c['empresa'] || '';
                
                // CRUCIAL: Tenta encontrar o ID do usuário pelo nome
                let usuarioId = mapUsuarios[this.normalizar(nomeAssist)];
                
                // Se não achou usuário, pula (ou loga erro)
                if (!usuarioId) {
                    if(nomeAssist) naoEncontrados.add(nomeAssist);
                    continue; 
                }

                // Tenta formatar a Empresa (Bonito)
                let empresaDisplay = nomeEmpresa;
                const empObj = mapEmpresas[this.normalizar(nomeEmpresa)];
                if (empObj) {
                    empresaDisplay = `${empObj.nome}`; // Usa o nome oficial do cadastro
                }

                // Tratamento de Data/Hora (end_time)
                let dataRef = null;
                let horaRef = null;
                const rawDate = c['endtime'] || c['data'] || c['date'];
                
                if (rawDate) {
                    try {
                        const dObj = new Date(rawDate);
                        if (!isNaN(dObj)) {
                            dataRef = dObj.toISOString().split('T')[0];
                            horaRef = dObj.toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'});
                        }
                    } catch(e) {}
                }

                if (!dataRef) continue; // Sem data não entra

                // Monta o objeto para o Banco (Tabela 'producao')
                inserts.push({
                    usuario_id: usuarioId,
                    data_referencia: dataRef,
                    hora: horaRef,
                    empresa: empresaDisplay,
                    
                    // Colunas Específicas da Assertividade
                    nome_documento: c['docname'] || c['documento'] || '',
                    status: c['status'] || '',
                    observacao: c['apontamentosobs'] || c['obs'] || '',
                    num_campos: parseInt(c['ncampos'] || 0),
                    qtd_ok: parseInt(c['ok'] || 0),
                    nok: parseInt(c['nok'] || 0),
                    assertividade: c['%assert'] || c['assertividade'] || '',
                    auditora: c['auditora'] || '',
                    
                    // Padrões
                    quantidade: 1, // Cada linha conta como 1 produção
                    fator: 1
                });
            }

            // 3. Salva no Banco (Batch Insert)
            // Dividir em lotes de 1000 para não estourar limite
            const loteSize = 1000;
            for (let i = 0; i < inserts.length; i += loteSize) {
                const lote = inserts.slice(i, i + loteSize);
                const { error } = await Sistema.supabase.from('producao').insert(lote);
                if (error) throw error;
            }

            let msg = `Sucesso!\n${inserts.length} registros de assertividade importados.`;
            if (naoEncontrados.size > 0) {
                msg += `\n\nATENÇÃO: ${naoEncontrados.size} assistentes da planilha não foram encontrados no sistema (verifique a ortografia em Usuários):\n` + Array.from(naoEncontrados).slice(0, 5).join(', ');
            }
            
            alert(msg);
            
            // Atualiza tela
            if(Gestao.Assertividade) Gestao.Assertividade.carregar();

        } catch (e) {
            console.error(e);
            alert("Erro na importação: " + e.message);
        } finally {
            btnLabel.innerHTML = originalHtml;
            btnLabel.classList.remove('opacity-50', 'cursor-not-allowed');
            input.value = "";
        }
    },

    normalizar: function(str) {
        return String(str || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, "").replace(/ /g, ''); // Remove acentos e espaços
    },

    normalizarKey: function(k) {
        // Remove caracteres especiais para achar as colunas (ex: "nº Campos" vira "ncampos")
        return String(k).trim().toLowerCase().replace(/[^a-z0-9]/g, "");
    }
};